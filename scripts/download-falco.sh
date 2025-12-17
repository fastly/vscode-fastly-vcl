#!/bin/bash
set -e

FALCO_VERSION="v2.0.0"
BIN_DIR="$(dirname "$0")/../falco-js/bin"

mkdir -p "$BIN_DIR"

PLATFORMS="darwin-amd64 darwin-arm64 linux-amd64 linux-arm64"

for PLATFORM in $PLATFORMS; do
  DEST="$BIN_DIR/falco-$PLATFORM"
  if [ -f "$DEST" ]; then
    echo "falco-$PLATFORM already exists, skipping"
    continue
  fi
  echo "Downloading falco-$PLATFORM..."
  curl -fsSL "https://github.com/ysugimoto/falco/releases/download/$FALCO_VERSION/falco-$PLATFORM" -o "$DEST"
  chmod +x "$DEST"
done

echo "Done"
