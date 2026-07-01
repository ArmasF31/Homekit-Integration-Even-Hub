import Foundation
import Network

class Server {
    let listener: NWListener
    let homeKitManager = HomeKitManager()
    var activeConnections: [HTTPConnection] = []
    
    init(port: UInt16) throws {
        self.listener = try NWListener(using: .tcp, on: NWEndpoint.Port(rawValue: port)!)
    }
    
    func start() {
        listener.stateUpdateHandler = { state in
            switch state {
            case .ready:
                print("Server listening on port \(self.listener.port?.rawValue ?? 0)...")
            case .failed(let error):
                print("Server failed with error: \(error)")
            default:
                break
            }
        }
        
        listener.newConnectionHandler = { [weak self] connection in
            guard let self = self else { return }
            let conn = HTTPConnection(connection: connection, homeKitManager: self.homeKitManager)
            self.activeConnections.append(conn)
            // Cleanup closed connections
            self.activeConnections = self.activeConnections.filter { $0.connection.state != .cancelled }
        }
        
        listener.start(queue: .main)
    }
}

class HTTPConnection {
    let connection: NWConnection
    let homeKitManager: HomeKitManager
    var buffer = Data()
    
    init(connection: NWConnection, homeKitManager: HomeKitManager) {
        self.connection = connection
        self.homeKitManager = homeKitManager
        self.connection.start(queue: .main)
        readRequest()
    }
    
    func readRequest() {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, isComplete, error in
            guard let self = self else { return }
            
            if let data = data, !data.isEmpty {
                self.buffer.append(data)
                
                if self.isRequestComplete() {
                    if let requestStr = String(data: self.buffer, encoding: .utf8) {
                        self.handle(request: requestStr)
                    }
                    return
                }
            }
            
            if error != nil || isComplete {
                self.connection.cancel()
            } else {
                self.readRequest()
            }
        }
    }
    
    private func isRequestComplete() -> Bool {
        var separatorRange: Range<Data.Index>? = nil
        var headerLength = 0
        
        if let range = buffer.range(of: "\r\n\r\n".data(using: .utf8)!) {
            separatorRange = range
            headerLength = range.lowerBound
        } else if let range = buffer.range(of: "\n\n".data(using: .utf8)!) {
            separatorRange = range
            headerLength = range.lowerBound
        }
        
        guard let sepRange = separatorRange else {
            return false
        }
        
        let headerData = buffer.subdata(in: 0..<headerLength)
        guard let headerStr = String(data: headerData, encoding: .utf8) else {
            return false
        }
        
        let normalizedHeader = headerStr.replacingOccurrences(of: "\r\n", with: "\n")
        let lines = normalizedHeader.components(separatedBy: "\n")
        var contentLength = 0
        for line in lines {
            let parts = line.split(separator: ":", maxSplits: 1)
            if parts.count == 2 && String(parts[0]).trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "content-length" {
                if let length = Int(String(parts[1]).trimmingCharacters(in: .whitespacesAndNewlines)) {
                    contentLength = length
                    break
                }
            }
        }
        
        let totalExpectedLength = sepRange.upperBound + contentLength
        return buffer.count >= totalExpectedLength
    }
    
    func handle(request: String) {
        let lines = request.components(separatedBy: "\r\n")
        guard let firstLine = lines.first else { return }
        let parts = firstLine.components(separatedBy: " ")
        guard parts.count >= 2 else { return }
        let method = parts[0]
        let path = parts[1]
        
        // Extract body if present
        var body = ""
        if let index = request.range(of: "\r\n\r\n")?.upperBound {
            body = String(request[index...]).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        
        if method == "OPTIONS" {
            // CORS preflight response
            sendResponse(statusCode: 200, contentType: "text/plain", body: "", isCORSPreflight: true)
        } else if method == "GET" && path == "/api/" {
            // Pass connection check
            sendResponse(statusCode: 200, contentType: "application/json", body: "{\"message\": \"API running.\"}")
        } else if method == "POST" && (path == "/api/template" || path == "/api/template/") {
            // Serve the dashboard state JSON
            let dashboard = homeKitManager.getDashboardJSON()
            sendResponse(statusCode: 200, contentType: "application/json", body: dashboard)
        } else if method == "POST" && path.hasPrefix("/api/services/") {
            // Control action
            let params = parseParams(path: path, body: body)
            
            homeKitManager.handleServiceCall(method: method, path: path, params: params) { success in
                let responseBody = "{\"success\": \(success)}"
                self.sendResponse(statusCode: success ? 200 : 400, contentType: "application/json", body: responseBody)
            }
        } else {
            sendResponse(statusCode: 404, contentType: "text/plain", body: "Not Found")
        }
    }
    
    private func parseParams(path: String, body: String) -> [String: Any] {
        var params: [String: Any] = [:]
        
        // 1. Parse URL query parameters
        if let urlComponents = URLComponents(string: path), let queryItems = urlComponents.queryItems {
            for item in queryItems {
                if let val = item.value {
                    if let intVal = Int(val) {
                        params[item.name] = intVal
                    } else if let doubleVal = Double(val) {
                        params[item.name] = doubleVal
                    } else if val == "true" {
                        params[item.name] = true
                    } else if val == "false" {
                        params[item.name] = false
                    } else {
                        params[item.name] = val
                    }
                }
            }
        }
        
        // 2. Parse JSON body parameters
        if !body.isEmpty, let bodyData = body.data(using: .utf8),
           let json = try? JSONSerialization.jsonObject(with: bodyData, options: []) as? [String: Any] {
            for (key, val) in json {
                params[key] = val
            }
        }
        
        return params
    }
    
    func sendResponse(statusCode: Int, contentType: String, body: String, isCORSPreflight: Bool = false) {
        var response = "HTTP/1.1 \(statusCode) \(statusCode == 200 ? "OK" : "Error")\r\n"
        response += "Access-Control-Allow-Origin: *\r\n"
        response += "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
        response += "Access-Control-Allow-Headers: Content-Type, Authorization\r\n"
        response += "Connection: close\r\n"
        
        if isCORSPreflight {
            response += "Content-Length: 0\r\n\r\n"
        } else {
            let data = body.data(using: .utf8) ?? Data()
            response += "Content-Type: \(contentType)\r\n"
            response += "Content-Length: \(data.count)\r\n\r\n"
            response += body
        }
        
        connection.send(content: response.data(using: .utf8), completion: .contentProcessed({ _ in
            self.connection.cancel()
        }))
    }
}
