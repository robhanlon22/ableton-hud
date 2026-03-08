#!/usr/bin/env bash
set -euo pipefail

tag="${1:?expected tag}"
app_path="dist/mac-universal/Ableton HUD.app"
zip_path="dist/Ableton-HUD-${tag}-mac-universal.zip"
sha_path="${zip_path}.sha256"

if [ ! -d "${app_path}" ]; then
  echo "Missing app bundle at ${app_path}" >&2
  exit 1
fi

rm -f "${zip_path}" "${sha_path}"

ditto -c -k --sequesterRsrc --keepParent "${app_path}" "${zip_path}"
hash="$(shasum -a 256 "${zip_path}" | awk '{print $1}')"
printf '%s  %s\n' "${hash}" "$(basename "${zip_path}")" > "${sha_path}"
