#!/usr/bin/env bash
set -euo pipefail

# myclean Universal Release Packaging Script
# Generates ad-hoc signed .app bundles and compressed .dmg files for:
# 1. Universal binary (Apple Silicon + Intel x86_64)
# 2. Apple Silicon (aarch64)
# 3. Intel 64-bit (x86_64)

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="1.0.0"
OUTPUT_DIR="${REPO_ROOT}/release-artifacts"
TEMP_DIR="/tmp/myclean-packaging-$$"

echo "=========================================================="
echo "  myclean v${VERSION} — macOS Release Packaging"
echo "=========================================================="
echo "Working directory: ${REPO_ROOT}"
echo "Output directory:  ${OUTPUT_DIR}"

mkdir -p "${OUTPUT_DIR}"
rm -rf "${TEMP_DIR}"
mkdir -p "${TEMP_DIR}"

cleanup() {
  rm -rf "${TEMP_DIR}"
}
trap cleanup EXIT

# 1. Build frontend if needed
if [ ! -d "${REPO_ROOT}/dist" ] || [ ! -f "${REPO_ROOT}/dist/index.html" ]; then
  echo "--> Building frontend assets..."
  (cd "${REPO_ROOT}" && npm run build)
fi

AARCH64_BIN="${REPO_ROOT}/src-tauri/target/aarch64-apple-darwin/release/myclean"
X86_64_BIN="${REPO_ROOT}/src-tauri/target/x86_64-apple-darwin/release/myclean"

# 2. Check binary targets
if [ ! -f "${AARCH64_BIN}" ]; then
  echo "--> Building aarch64 binary..."
  (cd "${REPO_ROOT}/src-tauri" && cargo build --release --target aarch64-apple-darwin)
fi

if [ ! -f "${X86_64_BIN}" ]; then
  echo "--> Building x86_64 binary..."
  (cd "${REPO_ROOT}/src-tauri" && cargo build --release --target x86_64-apple-darwin)
fi

# 3. Create universal binary with lipo
UNIVERSAL_BIN="${TEMP_DIR}/myclean_universal"
echo "--> Creating universal binary with lipo..."
lipo -create -output "${UNIVERSAL_BIN}" "${AARCH64_BIN}" "${X86_64_BIN}"
echo "Universal binary architectures:"
lipo -info "${UNIVERSAL_BIN}"

# Helper function to package .app and .dmg
package_target() {
  local TARGET_NAME="$1"       # e.g., "universal", "aarch64", "x86_64"
  local SOURCE_BIN="$2"        # path to binary
  local STAGING="${TEMP_DIR}/staging-${TARGET_NAME}"
  local APP_BUNDLE="${STAGING}/myclean.app"
  local DMG_OUT="${OUTPUT_DIR}/myclean-${VERSION}-${TARGET_NAME}.dmg"

  echo "----------------------------------------------------------"
  echo "Packaging target: ${TARGET_NAME}"
  echo "----------------------------------------------------------"

  rm -rf "${STAGING}"
  mkdir -p "${APP_BUNDLE}/Contents/MacOS"
  mkdir -p "${APP_BUNDLE}/Contents/Resources"

  # Copy binary and set executable permission
  cp "${SOURCE_BIN}" "${APP_BUNDLE}/Contents/MacOS/myclean"
  chmod 755 "${APP_BUNDLE}/Contents/MacOS/myclean"

  # Copy icon
  if [ -f "${REPO_ROOT}/src-tauri/icons/icon.icns" ]; then
    cp "${REPO_ROOT}/src-tauri/icons/icon.icns" "${APP_BUNDLE}/Contents/Resources/icon.icns"
  fi

  # Create Info.plist
  cat <<EOF > "${APP_BUNDLE}/Contents/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleDevelopmentRegion</key>
	<string>en</string>
	<key>CFBundleDisplayName</key>
	<string>myclean</string>
	<key>CFBundleExecutable</key>
	<string>myclean</string>
	<key>CFBundleIdentifier</key>
	<string>com.myclean.app</string>
	<key>CFBundleInfoDictionaryVersion</key>
	<string>6.0</string>
	<key>CFBundleName</key>
	<string>myclean</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>CFBundleShortVersionString</key>
	<string>${VERSION}</string>
	<key>CFBundleVersion</key>
	<string>${VERSION}</string>
	<key>CSResourcesFileMapped</key>
	<true/>
	<key>LSApplicationCategoryType</key>
	<string>public.app-category.utilities</string>
	<key>LSMinimumSystemVersion</key>
	<string>11.0</string>
	<key>CFBundleIconFile</key>
	<string>icon.icns</string>
	<key>NSHighResolutionCapable</key>
	<true/>
	<key>NSHumanReadableCopyright</key>
	<string>Copyright © 2026 myclean. All rights reserved.</string>
</dict>
</plist>
EOF

  # Ad-hoc code signing
  echo "--> Ad-hoc codesigning ${APP_BUNDLE}..."
  codesign --force --deep -s - "${APP_BUNDLE}"
  codesign --verify --deep --strict "${APP_BUNDLE}"
  echo "    Signature verified successfully."

  # Add drag-and-drop link to /Applications
  ln -s /Applications "${STAGING}/Applications"

  # Create compressed UDZO DMG
  echo "--> Creating DMG: ${DMG_OUT}..."
  rm -f "${DMG_OUT}"
  hdiutil create -volname "myclean" -srcfolder "${STAGING}" -ov -format UDZO "${DMG_OUT}" > /dev/null

  echo "    Created ${DMG_OUT} ($(du -sh "${DMG_OUT}" | cut -f1))"
}

# Package Universal (Recommended)
package_target "universal" "${UNIVERSAL_BIN}"

# Package Apple Silicon (aarch64)
package_target "aarch64" "${AARCH64_BIN}"

# Package Intel (x86_64)
package_target "x86_64" "${X86_64_BIN}"

# 4. Generate SHA-256 Checksums
echo "=========================================================="
echo "--> Generating SHA256SUMS.txt..."
(
  cd "${OUTPUT_DIR}"
  shasum -a 256 myclean-${VERSION}-*.dmg > SHA256SUMS.txt
  cat SHA256SUMS.txt
)

echo "=========================================================="
echo "Release packaging complete! All artifacts ready in ${OUTPUT_DIR}"
echo "=========================================================="
