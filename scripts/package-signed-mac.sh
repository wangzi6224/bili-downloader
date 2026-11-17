#!/usr/bin/env bash
set -euo pipefail

# 先运行 npm run build:mac:prepare，生成应用并准备两个架构的 ffmpeg。
for name in MAC_CERTIFICATE_BASE64 MAC_CERTIFICATE_PASSWORD APPLE_API_KEY_BASE64 APPLE_API_KEY_ID APPLE_API_ISSUER; do
  if [[ -z "${!name:-}" ]]; then
    echo "缺少签名配置：$name" >&2
    exit 1
  fi
done

work_dir=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/bili-signing.XXXXXXXX")
keychain="$work_dir/signing.keychain-db"
mount_point=''
verified=false

cleanup() {
  if [[ -n "$mount_point" ]]; then
    hdiutil detach "$mount_point" -quiet || true
  fi
  security delete-keychain "$keychain" 2>/dev/null || true
  rm -rf "$work_dir"
  # Bash 3.2 的 EXIT trap 遇到未绑定变量时也可能拿到状态 0。
  if [[ "$verified" != true ]]; then
    exit 1
  fi
}
trap cleanup EXIT

certificate="$work_dir/certificate.p12"
export APPLE_API_KEY="$work_dir/notary.p8"
(
  umask 077
  printf '%s' "$MAC_CERTIFICATE_BASE64" | base64 --decode > "$certificate"
  printf '%s' "$APPLE_API_KEY_BASE64" | base64 --decode > "$APPLE_API_KEY"
)
unset MAC_CERTIFICATE_BASE64 APPLE_API_KEY_BASE64

keychain_password=$(openssl rand -hex 32)
security create-keychain -p "$keychain_password" "$keychain"
security set-keychain-settings -lut 21600 "$keychain"
security unlock-keychain -p "$keychain_password" "$keychain"
security import "$certificate" -k "$keychain" -f pkcs12 -P "$MAC_CERTIFICATE_PASSWORD" -T /usr/bin/codesign
security set-key-partition-list -S apple-tool:,apple: -s -k "$keychain_password" "$keychain" >/dev/null
rm "$certificate"
unset MAC_CERTIFICATE_PASSWORD keychain_password

# codesign 从用户搜索列表构建证书链。删除临时钥匙串时 security 一并移除这一项。
search_list=$(security list-keychains -d user)
keychains=("$keychain")
while IFS='"' read -r _ path _; do
  if [[ -n "$path" ]]; then
    keychains+=("$path")
  fi
done <<< "$search_list"
security list-keychains -d user -s "${keychains[@]}"

developer_id() {
  security find-identity -v -p codesigning "$keychain" | awk '/"Developer ID Application: / && !found {print $2; found=1}'
}

identity=$(developer_id)
if [[ -z "$identity" ]]; then
  # 某些 .p12 仅包含叶证书。补齐 Apple 的 Developer ID 中间证书后重查。
  installed=$(security find-certificate -a -Z -c 'Developer ID Certification Authority' "$keychain" || true)
  for ca in DeveloperIDCA DeveloperIDG2CA; do
    curl -fsS --retry 2 -o "$work_dir/$ca.cer" "https://www.apple.com/certificateauthority/$ca.cer"
    fingerprint=$(openssl x509 -inform DER -in "$work_dir/$ca.cer" -noout -sha256 -fingerprint)
    fingerprint=${fingerprint#*=}
    if [[ "$installed" != *"${fingerprint//:/}"* ]]; then
      security add-certificates -k "$keychain" "$work_dir/$ca.cer"
    fi
  done
  identity=$(developer_id)
fi
if [[ -z "$identity" ]]; then
  echo '临时钥匙串中找不到有效的 Developer ID Application 签名身份。请检查证书、私钥和信任链。' >&2
  exit 1
fi
export CSC_KEYCHAIN="$keychain"

# electron-builder 先给 .app 签名、公证并附票，再把同一份 .app 放进 ZIP 和 DMG。
./node_modules/.bin/electron-builder --mac --x64 --arm64 --publish never \
  -c.mac.identity="$identity" -c.mac.hardenedRuntime=true -c.mac.notarize=true -c.forceCodeSigning=true
node scripts/compress-dmg.mjs

verify_app() {
  local app="$1" arch="$2"
  local signature executable
  codesign --verify --deep --strict --verbose=2 "$app"
  signature=$(codesign --display --verbose=4 "$app" 2>&1)
  if ! grep -q '^Authority=Developer ID Application:' <<< "$signature" ||
     ! grep -q '^CodeDirectory .*flags=.*runtime' <<< "$signature"; then
    echo "应用缺少 Developer ID Application 签名或 Hardened Runtime：$app" >&2
    return 1
  fi
  executable=$(plutil -extract CFBundleExecutable raw -o - "$app/Contents/Info.plist")
  xcrun lipo "$app/Contents/MacOS/$executable" -verify_arch "$arch"
  xcrun stapler validate "$app"
  spctl --assess --type execute --verbose=2 "$app"
}

version=$(node -p 'require("./package.json").version')
product_name=$(node -p 'require("./package.json").productName')
notary_auth=(--key "$APPLE_API_KEY" --key-id "$APPLE_API_KEY_ID" --issuer "$APPLE_API_ISSUER")
for arch in arm64 x64; do
  binary_arch="$arch"
  if [[ "$arch" == x64 ]]; then
    binary_arch=x86_64
  fi
  artifact="dist/bili-downloader-$version-$arch"
  unpacked="$work_dir/$arch"
  mkdir "$unpacked"
  ditto -x -k "$artifact.zip" "$unpacked"
  verify_app "$unpacked/$product_name.app" "$binary_arch"

  # hdiutil convert 会重写镜像，必须在 LZMA 转换完成后为最终 DMG 签名并附票。
  dmg="$artifact.dmg"
  codesign --sign "$identity" --keychain "$keychain" --timestamp "$dmg"
  xcrun notarytool submit "$dmg" "${notary_auth[@]}" --wait --timeout 25m --output-format json > "$work_dir/notary.json"
  submission_id=$(plutil -extract id raw -o - "$work_dir/notary.json")
  status=$(plutil -extract status raw -o - "$work_dir/notary.json")
  printf 'DMG 公证 %s：%s（%s）\n' "$arch" "$status" "$submission_id"
  if [[ "$status" != Accepted ]]; then
    xcrun notarytool log "$submission_id" "${notary_auth[@]}" || true
    exit 1
  fi
  xcrun stapler staple "$dmg"
  xcrun stapler validate "$dmg"
  codesign --verify --strict --verbose=2 "$dmg"
  spctl --assess --type open --context context:primary-signature --verbose=2 "$dmg"

  mount_point="$work_dir/mounted-$arch"
  mkdir "$mount_point"
  hdiutil attach -readonly -nobrowse -quiet -mountpoint "$mount_point" "$dmg"
  verify_app "$mount_point/$product_name.app" "$binary_arch"
  hdiutil detach "$mount_point" -quiet
  mount_point=''
done
verified=true
