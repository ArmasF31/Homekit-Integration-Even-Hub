# Mac HomeKit Bridge App

A native macOS Menu Bar application in Swift that accesses your local Apple HomeKit database and exposes a local REST API on port `8123`.

This server exposes REST endpoints (`/api/`, `/api/template`, `/api/services/*`) representing your HomeKit status and accessories. Because the G2 smart glasses app is fully compatible with this API, you can connect your glasses directly to this Mac bridge to control **all of your native HomeKit devices** in one unified view.

---

## How to Set Up in Xcode

Follow these step-by-step instructions to compile and run the app on your Mac Mini (or any Mac on the same Wi-Fi network):

### 1. Create a New Xcode Project
1. Open **Xcode** on your Mac.
2. Select **File > New > Project...** from the menu bar.
3. Select **macOS** at the top, choose **App** under Application, and click **Next**.
4. Enter the project details:
   - **Product Name**: `HomeKitBridge`
   - **Organization Identifier**: `com.yourname`
   - **Interface**: `SwiftUI`
   - **Language**: `Swift`
5. Click **Next** and save the project folder on your disk.

### 2. Add the Swift Source Files
1. Xcode will generate some default templates (like `ContentView.swift` and `HomeKitBridgeApp.swift`). **Delete these default files** (move them to trash).
2. Drag and drop the three Swift files from this directory into the Xcode project file navigator (on the left side):
   - [App.swift](App.swift)
   - [HTTPServer.swift](HTTPServer.swift)
   - [HomeKitManager.swift](HomeKitManager.swift)
3. Select **Copy items if needed** and click **Finish**.

### 3. Configure Signing & Capabilities (Required)
Because Apple restricts access to HomeKit for privacy reasons, you must enable the proper capabilities:
1. Select the top-level **HomeKitBridge** project icon in the Xcode left navigator.
2. Select the **HomeKitBridge** target in the main editor area.
3. Click the **Signing & Capabilities** tab.
4. Click the **+ Capability** button in the top left corner, search for **HomeKit**, and double-click to add it.
5. In the existing **App Sandbox** section under capabilities:
   - Check **Incoming Connections (Server)** (required so the glasses can make requests to port 8123).
   - Check **Outgoing Connections (Client)**.

### 4. Add HomeKit Privacy Description
1. Click the **Info** tab next to Signing & Capabilities.
2. Scroll to the **Custom macOS Application Target Properties** list.
3. Hover over any row, click the **+** button, and select/type:
   - **Key**: `Privacy - HomeKit Usage Description`
   - **Value**: `Allows the smart glasses to interface with your accessories.`

### 5. Build and Run
1. Select your Mac as the build destination.
2. Click the **Run (Play button)** in the top left corner of Xcode.
3. A house icon will appear in your macOS menu bar. 
4. macOS will prompt you: `"HomeKitBridge" would like to access your home data.` Click **OK**.
5. Once approved, the menu bar icon status will turn green showing:
   - `HomeKit: Connected`
   - `Server: Port 8123`

---

## How to Connect Your Smart Glasses

Once the bridge app is running on your Mac:

1. Find the local IP address of your Mac (e.g. `http://192.168.1.150`). You can find this under **System Settings > Wi-Fi > Details**.
2. Open the configurator page in your phone companion app webview.
3. Update the **Server URL** to point to your Mac:
   ```
   http://<YOUR-MAC-IP>:8123
   ```
   *(Note: If you are testing in the browser simulator on the same Mac, you can use `http://localhost:8123`!)*
4. Enter any random string in the **Long-Lived Access Token** input (it is not checked by the Mac server, but is required to pass input form validations).
5. Click **Save Config**!
6. Look through your glasses: your entire Apple Home setup (native HomeKit accessories) will load instantly.
