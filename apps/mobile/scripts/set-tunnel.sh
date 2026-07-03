#!/usr/bin/env bash
# Point the mobile app's Google exchange at a public https tunnel to local
# web-v3, for testing the real sign-in on an Android dev build (Android can't
# use localhost — Google rejects non-localhost http redirects, so we need an
# https tunnel in front of `pnpm --filter web-v3 dev`).
#
# Usage:  scripts/set-tunnel.sh https://<sub>.trycloudflare.com
#         (pass the tunnel ROOT — no path. Re-run whenever the tunnel URL changes.)
set -euo pipefail

BASE="${1:-}"
if [ -z "$BASE" ]; then
  echo "usage: $0 https://<tunnel-host>   (the tunnel root, no path)" >&2
  exit 1
fi
BASE="${BASE%/}"                          # strip any trailing slash
EXCHANGE="$BASE/api/mobile-auth"
ENV="$(cd "$(dirname "$0")/.." && pwd)/.env.local"
LINE="EXPO_PUBLIC_EXCHANGE_BASE_URL=$EXCHANGE"

if grep -q '^EXPO_PUBLIC_EXCHANGE_BASE_URL=' "$ENV" 2>/dev/null; then
  sed -i "s#^EXPO_PUBLIC_EXCHANGE_BASE_URL=.*#$LINE#" "$ENV"
else
  echo "$LINE" >> "$ENV"
fi

echo "✓ $ENV"
echo "  $LINE"
echo
echo "1) Register this EXACT redirect URI in Google Console"
echo "   (APIs & Services → Credentials → your Web OAuth client → Authorized redirect URIs):"
echo
echo "       $BASE/api/mobile-auth/bridge"
echo
echo "2) Rebuild so Expo re-inlines EXPO_PUBLIC_* (env is baked into the bundle):"
echo
echo "       npx expo run:android"
