#!/bin/bash
set -e

# Configuration
APP_NAME="HomeKitBridge"
BUNDLE_ID="com.armas.evenhub.homeassistant"
BUILD_DIR="./build"
APP_DIR="${BUILD_DIR}/${APP_NAME}.app"

echo "Creating clean build directory..."
rm -rf "${BUILD_DIR}"
mkdir -p "${APP_DIR}/Contents/MacOS"
mkdir -p "${APP_DIR}/Contents/Resources"

echo "Compiling Swift files for Mac Catalyst (arm64)..."
swiftc \
  -target arm64-apple-ios14.0-macabi \
  -sdk $(xcrun --show-sdk-path --sdk macosx) \
  -I /Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk/System/iOSSupport/usr/include \
  -F /Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk/System/iOSSupport/System/Library/Frameworks \
  App.swift HTTPServer.swift HomeKitManager.swift \
  -o "${APP_DIR}/Contents/MacOS/${APP_NAME}"

echo "Creating Info.plist..."
cat <<EOF > "${APP_DIR}/Contents/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>${APP_NAME}</string>
    <key>CFBundleIdentifier</key>
    <string>${BUNDLE_ID}</string>
    <key>CFBundleName</key>
    <string>HomeKit G2 Bridge</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSMinimumSystemVersion</key>
    <string>11.0</string>
    <key>NSHomeKitUsageDescription</key>
    <string>Allows the smart glasses to interface with your accessories.</string>
    <key>UIDeviceFamily</key>
    <array>
        <integer>2</integer>
        <integer>6</integer>
    </array>
</dict>
</plist>
EOF

echo "Creating Entitlements.plist..."
cat <<EOF > "${BUILD_DIR}/entitlements.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.developer.homekit</key>
    <true/>
</dict>
</plist>
EOF

echo "Clearing extended attributes..."
xattr -cr "${APP_DIR}"

echo "Ad-hoc signing the application bundle..."
codesign -f -s - --entitlements "${BUILD_DIR}/entitlements.plist" "${APP_DIR}"

echo "Build complete! App bundle created at ${APP_DIR}"
