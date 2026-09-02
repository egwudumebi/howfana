#!/usr/bin/env bash
# Build a shareable Android APK for remote testers via EAS.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "→ Checking EAS login…"
if ! npx eas-cli whoami >/dev/null 2>&1; then
  echo "Not logged in. Run: npm run eas:login"
  exit 1
fi

if ! grep -q 'projectId' app.json 2>/dev/null; then
  echo "→ Linking project to Expo (one-time)…"
  npx eas-cli init
fi

echo "→ Starting preview Android build (internal APK)…"
echo "  When it finishes, share the install URL from the Expo dashboard."
npx eas-cli build --profile preview --platform android --non-interactive
