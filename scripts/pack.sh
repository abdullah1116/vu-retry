#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"

fail() {
  printf 'pack: error: %s\n' "$*" >&2
  exit 1
}

[ -f "$ROOT/manifest.json" ] || fail "manifest.json not found at $ROOT"

VERSION="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$ROOT/manifest.json")" \
  || fail "cannot read version from manifest.json"
[ -n "$VERSION" ] || fail "manifest.json has an empty version"

DIST="$ROOT/dist"
ZIP="$DIST/vu-retry-$VERSION.zip"
CRX="$DIST/vu-retry-$VERSION.crx"
SUMS="$DIST/vu-retry-$VERSION.sha256"

printf '==> validate (vu-retry %s)\n' "$VERSION"

while IFS= read -r -d '' file; do
  node --check "$file" || fail "syntax error in ${file#"$ROOT"/}"
done < <(find "$ROOT" -name '*.js' -not -path '*/node_modules/*' -not -path "$DIST/*" -print0)

python3 -m json.tool "$ROOT/manifest.json" > /dev/null || fail "manifest.json is not valid JSON"

node "$ROOT/tests/content-scripts.test.js" || fail "test suite failed"

printf '==> pack\n'

mkdir -p "$DIST"
rm -f "$ZIP" "$CRX" "$SUMS"

zip -r -X -9 "$ZIP" . \
  -x 'dist/*' '.git/*' '.github/*' 'tests/*' 'scripts/*' '*.zip' '*.crx' '*.pem' '.opencode/*' \
  > /dev/null || fail "zip failed"

root_entry="$(unzip -Z1 "$ZIP" | grep -x 'manifest.json' || true)"
[ "$root_entry" = "manifest.json" ] || fail "manifest.json is not at the archive root"

printf '  %s\n' "$(du -h "$ZIP" | cut -f1)  dist/$(basename "$ZIP")"

if [ -n "${CHROME_BIN:-}" ] && [ -x "${CHROME_BIN}" ]; then
  staging="$(mktemp -d)"
  trap 'rm -rf "${staging:-}"' EXIT
  stage="$staging/ext"
  mkdir -p "$stage"
  unzip -q "$ZIP" -d "$stage" || fail "cannot stage extension for packing"

  pack_args=(--no-sandbox --disable-gpu --disable-dev-shm-usage "--pack-extension=$stage")
  if [ -n "${CRX_KEY:-}" ] && [ -f "${CRX_KEY}" ]; then
    pack_args+=("--pack-extension-key=$CRX_KEY")
  fi

  if ! "$CHROME_BIN" "${pack_args[@]}" > "$staging/chrome.log" 2>&1; then
    tail -20 "$staging/chrome.log" >&2
    fail "chrome --pack-extension failed"
  fi
  [ -f "$stage.crx" ] || fail "chrome produced no .crx"
  mv "$stage.crx" "$CRX"
  printf '  %s\n' "$(du -h "$CRX" | cut -f1)  dist/$(basename "$CRX")"
else
  echo "skip: no CHROME_BIN, zip only"
fi

if [ -n "${CRX_KEY:-}" ] && [ -f "${CRX_KEY}" ]; then
  id="$(openssl rsa -in "$CRX_KEY" -pubout -outform DER 2>/dev/null | sha256sum | cut -c1-32 | tr '0-9a-f' 'a-p')" \
    || fail "cannot derive extension id from $CRX_KEY"
  [ -n "$id" ] || fail "cannot derive extension id from $CRX_KEY"
else
  id=""
fi

if [ -n "$id" ]; then
  echo "extension id: $id"
else
  echo "extension id: unstable (no key)"
fi

artifacts=("vu-retry-$VERSION.zip")
if [ -f "$CRX" ]; then
  artifacts+=("vu-retry-$VERSION.crx")
fi
( cd "$DIST" && sha256sum "${artifacts[@]}" > "$(basename "$SUMS")" ) || fail "sha256sum failed"

printf '==> dist\n'
for name in "${artifacts[@]}" "vu-retry-$VERSION.sha256"; do
  printf '  %-28s %8s\n' "$name" "$(du -h "$DIST/$name" | cut -f1)"
done
printf '==> done: vu-retry %s\n' "$VERSION"
