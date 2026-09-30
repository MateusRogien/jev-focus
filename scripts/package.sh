#!/usr/bin/env bash
# Builds dist/ and zips it for the Chrome Web Store: jev-focus-<version>.zip
set -euo pipefail
cd "$(dirname "$0")/.."

version=$(node -p "require('./package.json').version")
out="jev-focus-${version}.zip"

npm run --silent build
rm -f "$out"
(cd dist && zip -qr -X "../$out" .)

total=$(du -sb dist | cut -f1)
icons=$(du -sb dist/icons | cut -f1)
echo "$out  $(du -h "$out" | cut -f1) zipped · $(( (total - icons) / 1024 )) KB unpacked excluding icons"
