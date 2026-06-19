# HomeKit Control for Even G2 Smart Glasses

A unified head-up control interface for the **Even Realities G2 smart glasses**, allowing you to monitor and control your Apple HomeKit accessories (lights, switches, fans, climate control, covers, and locks) directly from your glasses. 

This project consists of two parts:
1. **HomeKit G2 Control Plugin**: A web-view plugin for the Even G2 smart glasses built with Vite, TypeScript, and the Even Hub SDK.
2. **Mac HomeKit Bridge**: A native macOS menu bar app (Swift) that exposes your local Apple HomeKit accessories database as a local REST API.

---

## Architecture

```
Even Realities G2 Glasses
         │
         ▼
 ┌──────────────┐          ┌──────────────────────┐
 │  G2 Control  │ ───────> │  Mac HomeKit Bridge  │ ───> Apple HomeKit DB
 │  Web Plugin  │          │    (Menu Bar App)    │
 └──────────────┘          └──────────────────────┘
```

* **The Glasses Plugin** runs on the Even G2 smart glasses, displaying a retro-style split-screen layout. The left side handles list navigation and item selection (controlled via the glasses' touchpad), and the right side displays large, custom dotted-matrix text for accessory states.
* **The API Interface** queries the **Mac HomeKit Bridge** on port `8123`.

---

## Features

- **Retro 4-bit HUD Font**: Dynamic rendering of status, brightness, and temperatures using custom CJK full-width blocks for high readability in proportional glasses displays.
- **Split-Screen Navigation**: Left-scrollable selection menu and right-side detail/status panel.
- **Full Accessory Support**:
  - **Lights**: Power toggle, brightness presets (25%, 50%, 75%, 100%).
  - **Climate**: Power toggle, targeted temperature controls.
  - **Fans**: Power toggle, speed control (Low, Medium, High).
  - **Covers/Blinds**: Open, close, stop.
  - **Locks**: Lock & unlock control.
- **Dashboard Summary**: Displays home average temperature, total active accessories, scenes, and offline devices on startup.
- **Accessory Filtering**: Toggle accessory visibility on the glasses via the companion application configuration page.

---

## 🚀 Setup & Installation

### 1. Even G2 Plugin Setup

First, ensure you have Node.js installed. Then, follow these steps to run the plugin locally:

```bash
# Navigate to the project directory
cd homekit-control

# Install dependencies
npm install

# Start the Vite development server
npm run dev
```

The plugin dev server will run on `http://localhost:5173/`. 

#### Sideloading onto Glasses:
1. Ensure your Mac/computer and phone are on the same Wi-Fi network.
2. Open the **Even Hub Companion App** on your phone.
3. Start the Even simulator or connect directly to real glasses using the Even CLI:
   ```bash
   npx @evenrealities/evenhub-cli dev
   ```
4. Scan the generated QR code with your Even Hub app to load the plugin.

---

### 2. Mac HomeKit Bridge Setup (Swift Helper)

To run the bridge app which exposes your local HomeKit devices:

1. Open **Xcode** on your Mac.
2. Create a new **macOS App** project named `HomeKitBridge`.
3. Delete the default template files and add the source files from the `mac-homekit-bridge/` folder:
   - `App.swift`
   - `HTTPServer.swift`
   - `HomeKitManager.swift`
4. Under the **Signing & Capabilities** tab of your project target:
   - Add the **HomeKit** capability.
   - Under **App Sandbox**, enable both **Incoming Connections (Server)** and **Outgoing Connections (Client)**.
5. In the **Info** tab, add the privacy description key `Privacy - HomeKit Usage Description`.
6. Click **Run** in Xcode. A home icon will appear in your Mac's Menu Bar (status turns green once connected on port `8123`).

---

## ⚙️ Configuration

Once the plugin is loaded on your glasses, you can configure your connection settings through the phone companion app's Web UI:

1. **Bridge URL**: Set this to `http://<YOUR-MAC-IP>:8123` (use `http://localhost:8123` if testing in a local browser simulator).
2. **Access Token**: Enter any random placeholder string (it is not checked by the Mac server but is required to pass form validations).
3. **Hide/Show Accessories**: Use the checkbox list on the configuration page to toggle which accessories should be visible on the glasses.

---

## 📂 Project Structure

```
homekit-control/
├── mac-homekit-bridge/  # Swift source files for macOS HomeKit Bridge
├── src/                 # Web UI & plugin logic (TypeScript)
│   ├── main.ts          # Even G2 SDK logic & event handlers
│   ├── homekit-api.ts   # HomeKit Bridge API wrapper class
│   └── ui.ts            # Companion application config page logic
├── index.html           # WebView container
├── app.json             # Even Hub manifest configuration
├── package.json         # Project dependencies & script entries
└── tsconfig.json        # TypeScript compiler configurations
```

---

## 👥 Contributors

* **[ArmasF31](https://github.com/ArmasF31)** — Project Creator & Lead Developer
* **Antigravity** — AI Coding Assistant by Google DeepMind
* **Claude** — AI Assistant by Anthropic
