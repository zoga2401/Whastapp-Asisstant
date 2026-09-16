#!/usr/bin/env bash
set -euo pipefail

# Safe PostgreSQL backup helper. It never deletes backups; retention cleanup
# should be performed by a separately reviewed scheduler.
output_dir="${BACKUP_DIR:-./backups/postgres}"
database="${DB_NAME:?Set DB_NAME in the environment}"
host="${DB_HOST:-127.0.0.1}"
port="${DB_PORT:-5432}"
user="${DB_USER:-postgres}"
mkdir -p "$output_dir"

stamp="$(date -u +%Y-%m-%d_%H-%M)"
file="$output_dir/ai_whatsapp_${stamp}.dump"
umask 077

echo "Creating PostgreSQL custom-format backup: $file"
pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="$file" \
  --dbname="$database" \
  --host="$host" \
  --port="$port" \
  --username="$user"

echo "Backup created. Validate without restoring with:"
echo "  pg_restore --list \"$file\""
