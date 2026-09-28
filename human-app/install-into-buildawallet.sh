#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-/home/don/buildawallet}"
HERE="$(cd "$(dirname "$0")" && pwd)"
DEST="$ROOT/human-app"

echo "Installing HUMAN frontend into $DEST"
rm -rf "$DEST"
mkdir -p "$DEST"
cp -a "$HERE"/. "$DEST"/
rm -rf "$DEST/node_modules" "$DEST/dist"

cd "$DEST"
npm install
npm run build

rm -rf "$ROOT/static/human-app"
mkdir -p "$ROOT/static/human-app"
cp -a dist/. "$ROOT/static/human-app/"

cat > "$ROOT/static/_redirects" <<'REDIRECTS'
/human /human-app/index.html 200
/human/ /human-app/index.html 200
/human/custody /human-app/index.html 200
/human/chains /human-app/index.html 200
/human/security /human-app/index.html 200
/human/studio /human-app/index.html 200
/human/release /human-app/index.html 200
/human/pay /human-app/index.html 200
/human/download /human-app/index.html 200
/human/* /human-app/index.html 200
/pay /human-app/index.html 200
REDIRECTS

echo
printf 'HUMAN frontend installed. Next:\n  cd %q\n  npx wrangler pages deploy ./static --project-name=buildawallet --branch=main\n' "$ROOT"
