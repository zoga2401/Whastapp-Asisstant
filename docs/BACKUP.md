# Backup and restore

Backups contain sensitive business data and Baileys credentials. Store them
outside Git with owner-only permissions and encrypt them at rest using the
host's approved mechanism.

## PostgreSQL

Linux:

```bash
DB_NAME=zoga_assistant ./scripts/backup-db.sh
pg_restore --list backups/postgres/ai_whatsapp_YYYY-MM-DD_HH-MM.dump
```

PowerShell:

```powershell
.\scripts\postgres-backup.ps1
.\scripts\postgres-restore-dry-run.ps1 .\backups\postgres\<file>.dump
```

Keep daily backups for seven days and, where capacity permits, weekly backups
for four weeks. A real restore requires a maintenance window, a separately
approved non-production target such as `ai_whatsapp_restore_test`, and
verification of contacts, conversations, messages, knowledge, memories,
reply jobs, audit logs, and settings. The supplied restore command is
validation-only and never connects to a database.

## Baileys

```bash
BAILEYS_SESSION_DIR=./session_baileys ./scripts/baileys-backup.sh
```

The PowerShell equivalent and dry-run archive inspection are in `scripts/`.
Stop the backend before any approved restore, preserve the existing session,
and pair again only when the session is confirmed unusable. Never expose a
session archive through the dashboard or a public directory.
