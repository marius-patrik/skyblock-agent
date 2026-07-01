#!/usr/bin/env sh
set -eu

REPO="${SKYAGENT_REPO:-marius-patrik/skyagent}"
VERSION="${SKYAGENT_VERSION:-latest}"
ARCHIVE="${SKYAGENT_ARCHIVE:-}"
INSTALL_DIR="${SKYAGENT_INSTALL_DIR:-$HOME/.local/bin}"
TARGET="$(uname -s)-$(uname -m)"

case "$TARGET" in
  Linux-x86_64) ASSET="skyagent-linux-x64.zip" ;;
  Darwin-x86_64) ASSET="skyagent-darwin-x64.zip" ;;
  Darwin-arm64) ASSET="skyagent-darwin-arm64.zip" ;;
  *) echo "Unsupported SkyAgent install target: $TARGET" >&2; exit 1 ;;
esac

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$INSTALL_DIR"

if [ -z "$ARCHIVE" ]; then
  if [ "$VERSION" = "latest" ]; then
    URL="https://github.com/$REPO/releases/latest/download/$ASSET"
  else
    URL="https://github.com/$REPO/releases/download/$VERSION/$ASSET"
  fi
  ARCHIVE="$TMP_DIR/$ASSET"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$URL" -o "$ARCHIVE"
  elif command -v wget >/dev/null 2>&1; then
    wget -q "$URL" -O "$ARCHIVE"
  else
    echo "curl or wget is required to download SkyAgent." >&2
    exit 1
  fi
fi

if ! command -v unzip >/dev/null 2>&1; then
  echo "unzip is required to install SkyAgent from $ARCHIVE." >&2
  exit 1
fi

unzip -q "$ARCHIVE" -d "$TMP_DIR"
if [ ! -f "$TMP_DIR/skyagent" ]; then
  FOUND=""
  while IFS= read -r CANDIDATE; do
    FOUND="$CANDIDATE"
    break
  done <<EOF
$(find "$TMP_DIR" -type f -name skyagent)
EOF
else
  FOUND="$TMP_DIR/skyagent"
fi
if [ -z "${FOUND:-}" ] || [ ! -f "$FOUND" ]; then
  echo "skyagent executable was not found in $ARCHIVE" >&2
  exit 1
fi

cp "$FOUND" "$INSTALL_DIR/skyagent"
chmod +x "$INSTALL_DIR/skyagent"

case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    LINE="export PATH=\"$INSTALL_DIR:\$PATH\""
    PROFILE="$HOME/.profile"
    if [ "$(uname -s)" = "Darwin" ] || [ "$(basename "${SHELL:-}")" = "zsh" ]; then
      PROFILE="$HOME/.zprofile"
    fi
    if [ -w "$HOME" ] && { [ ! -f "$PROFILE" ] || ! grep -F "$LINE" "$PROFILE" >/dev/null 2>&1; }; then
      printf '\n# SkyAgent\n%s\n' "$LINE" >> "$PROFILE"
      echo "Added $INSTALL_DIR to PATH in $PROFILE. Restart your shell to pick it up."
    else
      echo "Add $INSTALL_DIR to PATH to run skyagent from any shell."
    fi
    ;;
esac

"$INSTALL_DIR/skyagent" version
"$INSTALL_DIR/skyagent" doctor
