#!/usr/bin/env bash
set -euo pipefail

download_root="${1:?expected blob report download root}"
staging_root="${2:?expected merged blob report staging root}"

shopt -s nullglob
report_paths=(
  "${download_root}"/playwright-blob-report-*/report.zip
  "${download_root}"/playwright-blob-report-*/report-*.zip
)

if [ "${#report_paths[@]}" -eq 0 ]; then
  echo "No Playwright blob report archives found after download." >&2
  exit 1
fi

rm -rf "${staging_root}"
mkdir -p "${staging_root}"

for report_path in "${report_paths[@]}"; do
  report_name="$(basename "$(dirname "${report_path}")")"
  cp "${report_path}" "${staging_root}/${report_name}.zip"
done
