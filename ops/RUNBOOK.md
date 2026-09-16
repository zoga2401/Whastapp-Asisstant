# Stage 12 operator runbook

All backup and restore commands below are safe examples. Restore scripts are
dry-run validators and do not connect to PostgreSQL or extract Baileys keys.

```powershell
.\scripts\postgres-backup.ps1
.\scripts\postgres-restore-dry-run.ps1 .\backups\postgres\zoga-YYYYMMDD-HHMMSS.dump
.\scripts\baileys-backup.ps1
.\scripts\baileys-restore-dry-run.ps1 .\backups\baileys\baileys-YYYYMMDD-HHMMSS.zip
.\scripts\check-health.ps1
```

For Linux, use equivalent `pg_dump --format=custom` and `pg_restore --list`
commands. A real restore requires a ticket, a recent verified backup, a
maintenance window, and an explicit non-production rehearsal first.
