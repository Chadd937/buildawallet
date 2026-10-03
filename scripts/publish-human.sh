#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$ROOT/human-app"
STATIC="$ROOT/static"

cd "$APP"
if [ ! -d node_modules ] || [ ! -d node_modules/ethers ]; then
  npm install --legacy-peer-deps --no-audit --no-fund
fi
npm run build

cd "$ROOT"
rm -rf "$STATIC/assets"
mkdir -p "$STATIC/assets" "$STATIC/human"
cp -a "$APP/dist/assets/." "$STATIC/assets/"

for page in setup custody chains security studio create wallet release pay download; do
  cp "$APP/dist/index.html" "$STATIC/human/${page}.html"
done

cat > "$STATIC/_redirects" <<'EOF'
/human /human/setup 302
/human/ /human/setup 302
/human/build /human-build.html 200
/human/live /human-live.html 200
/pay /human-pay.html 200
EOF

echo "HUMAN build published into static/."
echo "HUMAN routes: /human/setup /human/custody /human/chains /human/security /human/studio /human/create /human/wallet /human/download"
echo "Legacy /human/release redirects into local browser-wallet creation."
echo "Machine API plans remain at /pay."
