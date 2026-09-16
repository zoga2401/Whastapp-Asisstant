#!/usr/bin/env bash
set -euo pipefail

session_dir="${BAILEYS_SESSION_DIR:-./session_baileys}"
output_dir="${BACKUP_DIR:-./backups/baileys}"
[[ -d "$session_dir" ]] || { echo "Session directory not found: $session_dir" >&2; exit 1; }
mkdir -p "$output_dir"
umask 077
stamp="$(date -u +%Y-%m-%d_%H-%M)"
archive="$output_dir/baileys_${stamp}.tar.gz"

echo "Archiving Baileys credentials to $archive"
tar -czf "$archive" -C "$session_dir" .
echo "Treat this archive like a password; never commit or publish it."
