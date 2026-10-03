#!/usr/bin/env bash
set -euo pipefail

REPO="Chadd937/buildawallet"
ROOT="${BUILD_A_WALLET_ROOT:-/home/don/buildawallet}"
KEY_DIR="${HOME}/.local/share/buildawallet"
KEYSTORE="${KEY_DIR}/buildawallet-release.jks"
KEY_ALIAS="buildawallet"
APK_URL="https://github.com/Chadd937/buildawallet/releases/download/android-latest/BuildAWallet-Wallet.apk"
TMP_RELEASE="$(mktemp -d)"
STORE_PASS=""

cleanup() {
  STORE_PASS=""
  rm -rf "${TMP_RELEASE}"
}
trap cleanup EXIT

command -v gh >/dev/null || { echo "gh is required" >&2; exit 1; }
command -v keytool >/dev/null || { echo "keytool/JDK is required" >&2; exit 1; }
command -v npx >/dev/null || { echo "Node/npx is required" >&2; exit 1; }

mkdir -p "${KEY_DIR}"
chmod 700 "${KEY_DIR}"

if [[ -f "${KEYSTORE}" ]]; then
  echo "Using existing Android release keystore: ${KEYSTORE}"
  read -rsp "Keystore password: " STORE_PASS
  echo
  keytool -list -keystore "${KEYSTORE}" -storepass "${STORE_PASS}" -alias "${KEY_ALIAS}" >/dev/null
else
  echo "Creating owner-controlled Android release keystore at: ${KEYSTORE}"
  read -rsp "Choose a strong keystore password: " STORE_PASS
  echo
  read -rsp "Repeat keystore password: " STORE_PASS_2
  echo
  [[ "${STORE_PASS}" == "${STORE_PASS_2}" ]] || { echo "Passwords do not match" >&2; exit 1; }
  unset STORE_PASS_2

  keytool -genkeypair \
    -v \
    -storetype JKS \
    -keystore "${KEYSTORE}" \
    -storepass "${STORE_PASS}" \
    -keypass "${STORE_PASS}" \
    -alias "${KEY_ALIAS}" \
    -keyalg RSA \
    -keysize 4096 \
    -validity 10000 \
    -dname "CN=BuildAWallet Android Release,O=BuildAWallet.xyz,C=US"
  chmod 600 "${KEYSTORE}"
fi

echo "Setting encrypted GitHub Actions signing secrets..."
base64 -w0 "${KEYSTORE}" | gh secret set BAW_ANDROID_KEYSTORE_B64 --repo "${REPO}"
printf '%s' "${STORE_PASS}" | gh secret set BAW_ANDROID_KEYSTORE_PASSWORD --repo "${REPO}"
printf '%s' "${KEY_ALIAS}" | gh secret set BAW_ANDROID_KEY_ALIAS --repo "${REPO}"
printf '%s' "${STORE_PASS}" | gh secret set BAW_ANDROID_KEY_PASSWORD --repo "${REPO}"

echo "Starting signed Android Wallet workflow..."
START_EPOCH="$(date +%s)"
gh workflow run "Android Wallet" --repo "${REPO}" --ref main

RUN_ID=""
for _ in $(seq 1 20); do
  candidate="$(gh run list --repo "${REPO}" --workflow "Android Wallet" --event workflow_dispatch --limit 1 --json databaseId,createdAt --jq '.[0] | [.databaseId,.createdAt] | @tsv' 2>/dev/null || true)"
  if [[ -n "${candidate}" ]]; then
    candidate_id="${candidate%%$'\t'*}"
    candidate_time="${candidate#*$'\t'}"
    candidate_epoch="$(date -d "${candidate_time}" +%s 2>/dev/null || echo 0)"
    if (( candidate_epoch >= START_EPOCH - 5 )); then
      RUN_ID="${candidate_id}"
      break
    fi
  fi
  sleep 2
done

[[ -n "${RUN_ID}" ]] || { echo "Could not resolve the new Android workflow run" >&2; exit 1; }

echo "Watching GitHub Actions run ${RUN_ID}..."
gh run watch "${RUN_ID}" --repo "${REPO}" --exit-status

echo "Reading published signed release..."
gh release view android-latest --repo "${REPO}" >/dev/null
gh release download android-latest \
  --repo "${REPO}" \
  --pattern 'BuildAWallet-Wallet.apk.sha256' \
  --dir "${TMP_RELEASE}"

SHA256="$(awk '{print $1}' "${TMP_RELEASE}/BuildAWallet-Wallet.apk.sha256")"
[[ "${SHA256}" =~ ^[0-9a-fA-F]{64}$ ]] || { echo "Invalid APK SHA-256" >&2; exit 1; }

echo "Configuring HUMAN Worker artifact values..."
cd "${ROOT}/cloudflare-human"
printf '%s' "${APK_URL}" | npx wrangler secret put HUMAN_APK_URL --config wrangler.deploy.jsonc
printf '%s' "${SHA256}" | npx wrangler secret put HUMAN_APK_SHA256 --config wrangler.deploy.jsonc

./deploy.sh

echo "Building and publishing the HUMAN frontend..."
cd "${ROOT}"
./scripts/publish-human.sh
npx wrangler pages deploy ./static \
  --project-name=buildawallet \
  --branch=main \
  --commit-dirty=true

echo "Verifying signed APK URL..."
curl -fsSIL "${APK_URL}" >/dev/null

echo
echo "BuildAWallet HUMAN Android release is live."
echo "APK: ${APK_URL}"
echo "SHA-256: ${SHA256}"
echo "Keystore backup (KEEP THIS SAFE): ${KEYSTORE}"
