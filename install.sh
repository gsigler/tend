#!/usr/bin/env bash
set -euo pipefail

REPO="gsigler/tend"
INSTALL_DIR="${TEND_INSTALL_DIR:-$HOME/.local/bin}"

# Detect platform
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin) os="darwin" ;;
  Linux)  os="linux" ;;
  *)      echo "Unsupported OS: $OS" >&2; exit 1 ;;
esac

case "$ARCH" in
  x86_64|amd64)  arch="x64" ;;
  arm64|aarch64) arch="arm64" ;;
  *)             echo "Unsupported architecture: $ARCH" >&2; exit 1 ;;
esac

ASSET="tend-${os}-${arch}"

# Get latest release tag
if command -v curl &>/dev/null; then
  fetch="curl -fsSL"
elif command -v wget &>/dev/null; then
  fetch="wget -qO-"
else
  echo "Error: curl or wget required" >&2
  exit 1
fi

echo "Detecting latest release..."
TAG=$($fetch "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | head -1 | sed 's/.*: "//;s/".*//')

if [ -z "$TAG" ]; then
  echo "Error: could not determine latest release" >&2
  exit 1
fi

URL="https://github.com/${REPO}/releases/download/${TAG}/${ASSET}"

echo "Downloading tend ${TAG} (${os}/${arch})..."
mkdir -p "$INSTALL_DIR"

if command -v curl &>/dev/null; then
  curl -fsSL "$URL" -o "${INSTALL_DIR}/tend"
else
  wget -q "$URL" -O "${INSTALL_DIR}/tend"
fi

chmod +x "${INSTALL_DIR}/tend"

echo ""
echo "tend installed to ${INSTALL_DIR}/tend"

# Check if install dir is in PATH
if [[ ":$PATH:" != *":${INSTALL_DIR}:"* ]]; then
  echo ""
  echo "Add this to your shell profile to use tend:"
  echo ""
  echo "  export PATH=\"${INSTALL_DIR}:\$PATH\""
fi
