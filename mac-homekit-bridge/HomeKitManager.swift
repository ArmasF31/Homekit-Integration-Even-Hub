import Foundation
import HomeKit

class HomeKitManager: NSObject, HMHomeManagerDelegate {
    let homeManager = HMHomeManager()
    var isLoaded = false
    var onLoaded: (() -> Void)?
    
    override init() {
        super.init()
        homeManager.delegate = self
    }
    
    func homeManagerDidUpdateHomes(_ manager: HMHomeManager) {
        isLoaded = true
        print("HomeKit loaded: found \(manager.homes.count) homes.")
        onLoaded?()
    }
    
    // Convert current HomeKit state to JSON compatible with our DashboardState interface!
    func getDashboardJSON() -> String {
        guard let primaryHome = homeManager.primaryHome ?? homeManager.homes.first else {
            return "{\"average_temp\": 21, \"total_rooms\": 0, \"total_scenes\": 0, \"total_offline\": 0, \"total_accessories\": 0, \"scenes\": [], \"rooms\": []}"
        }
        
        var totalAccessories = 0
        var totalOffline = 0
        
        // Map scenes (Action Sets)
        let scenesList = primaryHome.actionSets.map { actionSet -> [String: Any] in
            return [
                "id": actionSet.uniqueIdentifier.uuidString,
                "name": actionSet.name
            ]
        }
        
        // Map rooms and accessories
        var roomsList: [[String: Any]] = []
        let allRooms = primaryHome.rooms
        
        // Loop rooms
        for room in allRooms {
            let roomAccessories = primaryHome.accessories.filter { $0.room == room }
            if roomAccessories.isEmpty { continue }
            
            let accsMapped = mapAccessories(roomAccessories, &totalAccessories, &totalOffline)
            let temp = findRoomTemperature(roomAccessories)
            let humidity = findRoomHumidity(roomAccessories)
            
            roomsList.append([
                "id": room.uniqueIdentifier.uuidString,
                "name": room.name,
                "temp": temp,
                "humidity": humidity,
                "accessories": accsMapped
            ])
        }
        
        // Check for accessories in the default/entire home room
        let defaultRoomAccessories = primaryHome.accessories.filter { 
            $0.room == nil || $0.room == primaryHome.roomForEntireHome() 
        }
        if !defaultRoomAccessories.isEmpty {
            let accsMapped = mapAccessories(defaultRoomAccessories, &totalAccessories, &totalOffline)
            roomsList.append([
                "id": "default_room",
                "name": "Unassigned",
                "temp": 21,
                "humidity": 45,
                "accessories": accsMapped
            ])
        }
        
        // Calculate average temp
        let temperatures = roomsList.compactMap { $0["temp"] as? Double }
        let avgTemp = temperatures.isEmpty ? 21.0 : (temperatures.reduce(0, +) / Double(temperatures.count))
        
        let responseObj: [String: Any] = [
            "average_temp": Int(round(avgTemp)),
            "total_rooms": roomsList.count,
            "total_scenes": scenesList.count,
            "total_offline": totalOffline,
            "total_accessories": totalAccessories,
            "scenes": scenesList,
            "rooms": roomsList
        ]
        
        if let jsonData = try? JSONSerialization.data(withJSONObject: responseObj, options: [.prettyPrinted]),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            return jsonString
        }
        
        return "{}"
    }
    
    private func mapAccessories(_ accessories: [HMAccessory], _ totalCount: inout Int, _ offlineCount: inout Int) -> [[String: Any]] {
        var list: [[String: Any]] = []
        for acc in accessories {
            if acc.isBlocked { continue }
            totalCount += 1
            if !acc.isReachable {
                offlineCount += 1
            }
            
            let domain = getAccessoryDomain(acc)
            let stateInfo = getAccessoryState(acc, domain: domain)
            
            list.append([
                "id": acc.uniqueIdentifier.uuidString,
                "name": acc.name,
                "state": stateInfo.state,
                "domain": domain,
                "brightness": stateInfo.brightness ?? NSNull(),
                "target_temp": stateInfo.targetTemp ?? NSNull(),
                "current_temp": stateInfo.currentTemp ?? NSNull(),
                "speed_pct": stateInfo.speedPct ?? NSNull(),
                "position": stateInfo.position ?? NSNull()
            ])
        }
        return list
    }
    
    // Determine the category domain for a HomeKit accessory
    private func getAccessoryDomain(_ accessory: HMAccessory) -> String {
        let category = accessory.category.categoryType
        if category == HMAccessoryCategoryTypeLightbulb {
            return "light"
        } else if category == HMAccessoryCategoryTypeSwitch || category == HMAccessoryCategoryTypeOutlet {
            return "switch"
        } else if category == HMAccessoryCategoryTypeFan {
            return "fan"
        } else if category == HMAccessoryCategoryTypeThermostat {
            return "climate"
        } else if category == HMAccessoryCategoryTypeWindowCovering || category == HMAccessoryCategoryTypeWindow || category == HMAccessoryCategoryTypeDoor {
            return "cover"
        } else if category == HMAccessoryCategoryTypeDoorLock {
            return "lock"
        }
        
        // Fallback by service scanning
        for service in accessory.services {
            let type = service.serviceType
            if type == HMServiceTypeLightbulb { return "light" }
            if type == HMServiceTypeSwitch || type == HMServiceTypeOutlet { return "switch" }
            if type == HMServiceTypeFan { return "fan" }
            if type == HMServiceTypeThermostat { return "climate" }
            if type == HMServiceTypeWindowCovering { return "cover" }
            if type == HMServiceTypeLockMechanism { return "lock" }
        }
        
        return "switch" // default fallback
    }
    
    struct StateInfo {
        var state: String
        var brightness: Int?
        var targetTemp: Int?
        var currentTemp: Int?
        var speedPct: Int?
        var position: Int?
    }
    
    private func getAccessoryState(_ accessory: HMAccessory, domain: String) -> StateInfo {
        var info = StateInfo(state: "off")
        if !accessory.isReachable {
            info.state = "unavailable"
            return info
        }
        
        func findCharacteristic(serviceType: String, charType: String) -> HMCharacteristic? {
            return accessory.services.first(where: { $0.serviceType == serviceType })?.characteristics.first(where: { $0.characteristicType == charType })
        }
        
        if domain == "light" {
            if let powerChar = findCharacteristic(serviceType: HMServiceTypeLightbulb, charType: HMCharacteristicTypePowerState),
               let isOn = powerChar.value as? Bool {
                info.state = isOn ? "on" : "off"
            }
            if let briChar = findCharacteristic(serviceType: HMServiceTypeLightbulb, charType: HMCharacteristicTypeBrightness),
               let bri = briChar.value as? Int {
                info.brightness = bri
            }
        } else if domain == "switch" {
            let serviceType = accessory.services.contains(where: { $0.serviceType == HMServiceTypeOutlet }) ? HMServiceTypeOutlet : HMServiceTypeSwitch
            if let powerChar = findCharacteristic(serviceType: serviceType, charType: HMCharacteristicTypePowerState),
               let isOn = powerChar.value as? Bool {
                info.state = isOn ? "on" : "off"
            }
        } else if domain == "fan" {
            if let powerChar = findCharacteristic(serviceType: HMServiceTypeFan, charType: HMCharacteristicTypePowerState),
               let isOn = powerChar.value as? Bool {
                info.state = isOn ? "on" : "off"
            }
            if let speedChar = findCharacteristic(serviceType: HMServiceTypeFan, charType: HMCharacteristicTypeRotationSpeed),
               let speed = speedChar.value as? Int {
                info.speedPct = speed
            }
        } else if domain == "climate" {
            if let modeChar = findCharacteristic(serviceType: HMServiceTypeThermostat, charType: HMCharacteristicTypeTargetHeatingCooling),
               let mode = modeChar.value as? Int {
                // HomeKit Mode values: 0 = Off, 1 = Heat, 2 = Cool, 3 = Auto
                info.state = mode == 0 ? "off" : (mode == 1 ? "heat" : (mode == 2 ? "cool" : "auto"))
            }
            if let targetChar = findCharacteristic(serviceType: HMServiceTypeThermostat, charType: HMCharacteristicTypeTargetTemperature),
               let targetVal = targetChar.value as? Double {
                info.targetTemp = Int(round(targetVal))
            }
            if let currChar = findCharacteristic(serviceType: HMServiceTypeThermostat, charType: HMCharacteristicTypeCurrentTemperature),
               let currVal = currChar.value as? Double {
                info.currentTemp = Int(round(currVal))
            }
        } else if domain == "cover" {
            if let stateChar = findCharacteristic(serviceType: HMServiceTypeWindowCovering, charType: HMCharacteristicTypePositionState),
               let state = stateChar.value as? Int {
                // 0 = Decreasing (Closing), 1 = Increasing (Opening), 2 = Stopped
                info.state = state == 0 ? "closing" : (state == 1 ? "opening" : "stopped")
            }
            if let posChar = findCharacteristic(serviceType: HMServiceTypeWindowCovering, charType: HMCharacteristicTypeCurrentPosition),
               let pos = posChar.value as? Int {
                info.position = pos
                if info.state == "stopped" {
                    info.state = pos > 0 ? "open" : "closed"
                }
            }
        } else if domain == "lock" {
            if let stateChar = findCharacteristic(serviceType: HMServiceTypeLockMechanism, charType: HMCharacteristicTypeCurrentLockMechanismState),
               let state = stateChar.value as? Int {
                // 0 = Unsecured (Unlocked), 1 = Secured (Locked), 2 = Jammed, 3 = Unknown
                info.state = state == 1 ? "locked" : (state == 0 ? "unlocked" : "unknown")
            }
        }
        
        return info
    }
    
    private func findRoomTemperature(_ accessories: [HMAccessory]) -> Double {
        for acc in accessories {
            if let tempChar = acc.services.flatMap({ $0.characteristics }).first(where: { $0.characteristicType == HMCharacteristicTypeCurrentTemperature }),
               let val = tempChar.value as? Double {
                return val
            }
        }
        return 21.0
    }
    
    private func findRoomHumidity(_ accessories: [HMAccessory]) -> Double {
        for acc in accessories {
            if let humChar = acc.services.flatMap({ $0.characteristics }).first(where: { $0.characteristicType == HMCharacteristicTypeCurrentRelativeHumidity }),
               let val = humChar.value as? Double {
                return val
            }
        }
        return 45.0
    }
    
    // Trigger control action on HomeKit accessory
    func handleServiceCall(method: String, path: String, params: [String: Any], completion: @escaping (Bool) -> Void) {
        guard let primaryHome = homeManager.primaryHome ?? homeManager.homes.first else {
            completion(false)
            return
        }
        
        // Parse parameters from query or body
        let entityId = params["entity_id"] as? String ?? params["id"] as? String
        
        // Check if it's a scene or area/global command
        if path.contains("/scene/turn_on") {
            if let sceneId = entityId,
               let scene = primaryHome.actionSets.first(where: { $0.uniqueIdentifier.uuidString == sceneId }) {
                primaryHome.executeActionSet(scene) { error in
                    completion(error == nil)
                }
                return
            }
        } else if path.contains("/light/toggle") && entityId == "all" {
            toggleAllLights(home: primaryHome, completion: completion)
            return
        } else if path.contains("/light/toggle"), let areaId = params["area_id"] as? String {
            toggleAreaLights(home: primaryHome, areaId: areaId, completion: completion)
            return
        }
        
        guard let targetId = entityId,
              let accessory = primaryHome.accessories.first(where: { $0.uniqueIdentifier.uuidString == targetId }) else {
            completion(false)
            return
        }
        
        // Parse domain and action from path (e.g. /api/services/light/turn_on)
        // Split of "/api/services/light/turn_on" → ["", "api", "services", "light", "turn_on"]
        // so domain = index 3, action = index 4
        let pathParts = path.components(separatedBy: "/")
        guard pathParts.count >= 5 else {
            completion(false)
            return
        }
        let domain = pathParts[3]
        let action = pathParts[4]
        
        // For switch domain, check both Switch and Outlet service types
        let serviceType = getServiceType(for: domain)
        let alternateType = (domain == "switch") ? HMServiceTypeOutlet : nil
        guard let service = accessory.services.first(where: { $0.serviceType == serviceType })
                         ?? (alternateType.flatMap { alt in accessory.services.first(where: { $0.serviceType == alt }) }) else {
            completion(false)
            return
        }
        
        if domain == "light" || domain == "switch" || domain == "fan" {
            if action == "toggle" {
                if let powerChar = service.characteristics.first(where: { $0.characteristicType == HMCharacteristicTypePowerState }) {
                    let currentVal = powerChar.value as? Bool ?? false
                    powerChar.writeValue(!currentVal) { error in
                        completion(error == nil)
                    }
                } else { completion(false) }
            } else if action == "turn_on" || action == "set_percentage" {
                // Check if setting brightness or speed percentage
                if let briVal = params["brightness"] as? Int,
                   let briChar = service.characteristics.first(where: { $0.characteristicType == HMCharacteristicTypeBrightness }) {
                    let hkVal = Int(round((Double(briVal) / 255.0) * 100.0))
                    briChar.writeValue(hkVal) { error in completion(error == nil) }
                } else if let speedVal = params["percentage"] as? Int,
                          let speedChar = service.characteristics.first(where: { $0.characteristicType == HMCharacteristicTypeRotationSpeed }) {
                    speedChar.writeValue(speedVal) { error in completion(error == nil) }
                } else {
                    if let powerChar = service.characteristics.first(where: { $0.characteristicType == HMCharacteristicTypePowerState }) {
                        powerChar.writeValue(true) { error in completion(error == nil) }
                    } else { completion(false) }
                }
            } else if action == "turn_off" {
                if let powerChar = service.characteristics.first(where: { $0.characteristicType == HMCharacteristicTypePowerState }) {
                    powerChar.writeValue(false) { error in
                        completion(error == nil)
                    }
                } else { completion(false) }
            } else {
                completion(false)
            }
        } else if domain == "climate" {
            if action == "set_temperature" {
                if let temp = params["temperature"] as? Double,
                   let tempChar = service.characteristics.first(where: { $0.characteristicType == HMCharacteristicTypeTargetTemperature }) {
                    tempChar.writeValue(temp) { error in
                        completion(error == nil)
                    }
                } else { completion(false) }
            } else if action == "toggle" {
                if let modeChar = service.characteristics.first(where: { $0.characteristicType == HMCharacteristicTypeTargetHeatingCooling }) {
                    let currentVal = modeChar.value as? Int ?? 0
                    let newVal = currentVal == 0 ? 3 : 0 // Auto (3) vs Off (0)
                    modeChar.writeValue(newVal) { error in
                        completion(error == nil)
                    }
                } else { completion(false) }
            } else { completion(false) }
        } else if domain == "cover" {
            if action == "open_cover" {
                if let posChar = service.characteristics.first(where: { $0.characteristicType == HMCharacteristicTypeTargetPosition }) {
                    posChar.writeValue(100) { error in completion(error == nil) }
                } else { completion(false) }
            } else if action == "close_cover" {
                if let posChar = service.characteristics.first(where: { $0.characteristicType == HMCharacteristicTypeTargetPosition }) {
                    posChar.writeValue(0) { error in completion(error == nil) }
                } else { completion(false) }
            } else if action == "stop_cover" {
                if let currPosChar = service.characteristics.first(where: { $0.characteristicType == HMCharacteristicTypeCurrentPosition }),
                   let targetPosChar = service.characteristics.first(where: { $0.characteristicType == HMCharacteristicTypeTargetPosition }),
                   let currPos = currPosChar.value {
                    targetPosChar.writeValue(currPos) { error in completion(error == nil) }
                } else { completion(false) }
            } else { completion(false) }
        } else if domain == "lock" {
            if action == "lock" {
                if let lockChar = service.characteristics.first(where: { $0.characteristicType == HMCharacteristicTypeTargetLockMechanismState }) {
                    lockChar.writeValue(1) { error in completion(error == nil) } // 1 = Locked
                } else { completion(false) }
            } else if action == "unlock" {
                if let lockChar = service.characteristics.first(where: { $0.characteristicType == HMCharacteristicTypeTargetLockMechanismState }) {
                    lockChar.writeValue(0) { error in completion(error == nil) } // 0 = Unlocked
                } else { completion(false) }
            } else { completion(false) }
        } else {
            completion(false)
        }
    }
    
    private func getServiceType(for domain: String) -> String {
        switch domain {
        case "light": return HMServiceTypeLightbulb
        case "switch": return HMServiceTypeSwitch
        case "fan": return HMServiceTypeFan
        case "climate": return HMServiceTypeThermostat
        case "cover": return HMServiceTypeWindowCovering
        case "lock": return HMServiceTypeLockMechanism
        default: return HMServiceTypeSwitch
        }
    }
    
    private func toggleAllLights(home: HMHome, completion: @escaping (Bool) -> Void) {
        let lights = home.accessories.filter { getAccessoryDomain($0) == "light" }
        if lights.isEmpty {
            completion(true)
            return
        }
        
        var anyOn = false
        for light in lights {
            if let s = light.services.first(where: { $0.serviceType == HMServiceTypeLightbulb }),
               let p = s.characteristics.first(where: { $0.characteristicType == HMCharacteristicTypePowerState }),
               let isOn = p.value as? Bool, isOn {
                anyOn = true
                break
            }
        }
        
        let targetState = !anyOn
        let group = DispatchGroup()
        var success = true
        
        for light in lights {
            if let s = light.services.first(where: { $0.serviceType == HMServiceTypeLightbulb }),
               let p = s.characteristics.first(where: { $0.characteristicType == HMCharacteristicTypePowerState }) {
                group.enter()
                p.writeValue(targetState) { error in
                    if error != nil { success = false }
                    group.leave()
                }
            }
        }
        
        group.notify(queue: .main) {
            completion(success)
        }
    }
    
    private func toggleAreaLights(home: HMHome, areaId: String, completion: @escaping (Bool) -> Void) {
        guard let room = home.rooms.first(where: { $0.uniqueIdentifier.uuidString == areaId }) else {
            completion(false)
            return
        }
        
        let lights = home.accessories.filter { $0.room == room && getAccessoryDomain($0) == "light" }
        if lights.isEmpty {
            completion(true)
            return
        }
        
        var anyOn = false
        for light in lights {
            if let s = light.services.first(where: { $0.serviceType == HMServiceTypeLightbulb }),
               let p = s.characteristics.first(where: { $0.characteristicType == HMCharacteristicTypePowerState }),
               let isOn = p.value as? Bool, isOn {
                anyOn = true
                break
            }
        }
        
        let targetState = !anyOn
        let group = DispatchGroup()
        var success = true
        
        for light in lights {
            if let s = light.services.first(where: { $0.serviceType == HMServiceTypeLightbulb }),
               let p = s.characteristics.first(where: { $0.characteristicType == HMCharacteristicTypePowerState }) {
                group.enter()
                p.writeValue(targetState) { error in
                    if error != nil { success = false }
                    group.leave()
                }
            }
        }
        
        group.notify(queue: .main) {
            completion(success)
        }
    }
}
