#!/bin/bash
# Regenerate every icon from docs/icons/icon.svg.
#
# The SVG is the source of truth; the PNGs are output and should never be
# edited by hand. macOS renders the SVG (qlmanage) and resizes it (sips), so
# there is nothing to install — which matters in a repo that deliberately has
# no build step.
#
#   ./scripts/build-icons.sh
set -e
cd "$(dirname "$0")/../docs/icons"

tmp=$(mktemp -d)
qlmanage -t -s 1024 -o "$tmp" icon.svg >/dev/null 2>&1
qlmanage -t -s 1024 -o "$tmp" icon-maskable.svg >/dev/null 2>&1

sips -Z 512 "$tmp/icon.svg.png" --out icon-512.png >/dev/null
sips -Z 192 "$tmp/icon.svg.png" --out icon-192.png >/dev/null
sips -Z 180 "$tmp/icon.svg.png" --out apple-touch-icon.png >/dev/null
sips -Z 512 "$tmp/icon-maskable.svg.png" --out icon-maskable.png >/dev/null

# iOS wants one 1024 square, no transparency, no rounding of its own.
ios="../../ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"
[ -d "$(dirname "$ios")" ] && cp "$tmp/icon.svg.png" "$ios" && echo "iOS AppIcon updated"

rm -rf "$tmp"
echo "icons rebuilt from icon.svg"
