# Stage 12 production checklist

## Before rollout
- [ ] Use a dedicated PostgreSQL role with least privilege; apply migrations in order and take a verified backup.
- [ ] Set `NODE_ENV=production`, a random `ADMIN_SECRET_KEY`, and a strong scrypt password hash.
- [ ] Keep `WHATSAPP_AUTO_REPLY_ENABLED=false` until a supervised canary is complete.
- [ ] Keep `.env`, `session_baileys/`, and backup archives outside source control with owner-only permissions.
- [ ] Enable PostgreSQL TLS when crossing hosts (`DB_SSL=true` and certificate verification enabled).
- [ ] Put the dashboard/API behind Nginx HTTPS, firewall PostgreSQL and Ollama to localhost/private networks, and restrict `/metrics`.

## Monitoring
- Poll `/health/live` for process liveness and `/health/ready` for DB readiness.
- Alert on repeated 503s, PM2 restart loops, disk usage, backup age, and WhatsApp disconnects.
- Review structured logs without exporting message bodies or credentials.

## Staged rollout and rollback
1. Build and typecheck; run unit/integration mocks in CI.
2. Deploy backend with auto-reply disabled; verify `/health/ready`, dashboard login, and DB migrations.
3. Canary one approved contact with conservative rate limits; observe logs and delivery audit.
4. Expand gradually only after an operator review. Set the database emergency shutdown and environment kill switch first to stop.
5. Roll back by stopping the new process, restoring the previous artifact, and re-running health checks. Never roll back by dropping tables.

## Incident recovery/runbook
- **DB unavailable:** stop auto-reply, preserve logs, validate network/credentials, restore only from a reviewed backup.
- **WhatsApp logout:** stop backend, preserve the current session directory, use the dry-run archive inspection, then pair again if required.
- **Unexpected messages:** immediately set `WHATSAPP_AUTO_REPLY_KILL_SWITCH=true`, disable the control in the dashboard, and inspect audit events.
- Record incident time, operator, commands, backup ID, and verification results.
