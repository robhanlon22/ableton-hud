#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  exit 0
fi

readonly SYSTEM_TCC_DB="/Library/Application Support/com.apple.TCC/TCC.db"
readonly USER_TCC_DB="$HOME/Library/Application Support/com.apple.TCC/TCC.db"
readonly SCREEN_CAPTURE_SERVICE="kTCCServiceScreenCapture"

grant_screen_capture() {
  local db_path=$1
  local client_path=$2
  local use_sudo=$3
  local timestamp
  timestamp="$(date +%s)"

  if [[ ! -f "$db_path" ]]; then
    return
  fi

  local sql_query
  sql_query=$(
    cat <<SQL
DELETE FROM access
WHERE service = '${SCREEN_CAPTURE_SERVICE}'
  AND client = '${client_path}'
  AND client_type = 1;
INSERT OR REPLACE INTO access VALUES(
  '${SCREEN_CAPTURE_SERVICE}',
  '${client_path}',
  1,
  2,
  0,
  1,
  NULL,
  NULL,
  NULL,
  'UNUSED',
  NULL,
  0,
  ${timestamp},
  NULL,
  NULL,
  'UNUSED',
  ${timestamp}
);
SQL
  )

  if [[ "$use_sudo" == "true" ]]; then
    sudo sqlite3 "$db_path" "$sql_query"
    return
  fi

  sqlite3 "$db_path" "$sql_query"
}

for client_path in /bin/bash /usr/sbin/screencapture; do
  grant_screen_capture "$USER_TCC_DB" "$client_path" false
  grant_screen_capture "$SYSTEM_TCC_DB" "$client_path" true
done
