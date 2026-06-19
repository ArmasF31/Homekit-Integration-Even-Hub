import SwiftUI
import HomeKit
import Combine

@main
struct HomeKitBridgeApp: App {
    @StateObject private var serverHolder = ServerHolder()
    
    var body: some Scene {
        WindowGroup {
            VStack(spacing: 20) {
                Text("G2 HomeKit Bridge")
                    .font(.title)
                    .fontWeight(.bold)
                
                Text("Keep this app running in the background to allow your smart glasses to connect.")
                    .font(.body)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
                
                Divider()
                
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Circle()
                            .fill(serverHolder.isHomeKitLoaded ? Color.green : Color.orange)
                            .frame(width: 12, height: 12)
                        Text(serverHolder.isHomeKitLoaded ? "HomeKit: Connected" : "HomeKit: Loading...")
                            .font(.headline)
                    }
                    
                    HStack {
                        Circle()
                            .fill(serverHolder.isServerRunning ? Color.green : Color.red)
                            .frame(width: 12, height: 12)
                        Text(serverHolder.isServerRunning ? "Server: Running on Port 8124" : "Server: Port Error")
                            .font(.headline)
                    }
                }
                .padding()
                .background(Color.secondary.opacity(0.15))
                .cornerRadius(12)
                
                Spacer()
            }
            .padding()
            .frame(minWidth: 350, minHeight: 250)
        }
    }
}

class ServerHolder: ObservableObject {
    @Published var isHomeKitLoaded = false
    @Published var isServerRunning = false
    var server: Server?
    
    init() {
        do {
            let s = try Server(port: 8124)
            self.server = s
            s.homeKitManager.onLoaded = { [weak self] in
                DispatchQueue.main.async {
                    self?.isHomeKitLoaded = true
                }
            }
            s.start()
            self.isServerRunning = true
        } catch {
            print("Failed to start server: \(error)")
            self.isServerRunning = false
        }
    }
}
