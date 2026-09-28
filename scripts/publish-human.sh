#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$ROOT/human-app"
STATIC="$ROOT/static"

cd "$APP"
if [ ! -d node_modules ]; then
  npm install --legacy-peer-deps --no-audit --no-fund
fi
npm run build

cd "$ROOT"
rm -rf "$STATIC/assets"
mkdir -p "$STATIC/assets" "$STATIC/human"
cp -a "$APP/dist/assets/." "$STATIC/assets/"

for page in setup custody chains security studio release pay download; do
  cp "$APP/dist/index.html" "$STATIC/human/${page}.html"
done

cat > "$STATIC/_redirects" <<'EOF'
/human /human/setup 302
/human/ /human/setup 302
/human/build /human-build.html 200
/human/live /human-live.html 200
/pay /human/pay 302
EOF

echo "HUMAN build published into static/."
echo "Routes: /human/setup /human/custody /human/chains /human/security /human/studio /human/release /human/pay /human/download"
