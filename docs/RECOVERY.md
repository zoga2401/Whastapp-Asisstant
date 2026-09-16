# Recovery runbook

1. **Backend crash:** run `pm2 status`, inspect logs, and use
   `pm2 restart zoga-backend`; verify `/health/live` and `/health/ready`.
2. **Ollama failure:** check the local Ollama service and model, restart it,
   then verify `/api/ai/health`. Keep auto-reply disabled while unavailable.
3. **WhatsApp disconnect:** inspect Baileys status and logs. Preserve the
   session directory. If it is corrupt, stop the backend, archive it, use the
   dry-run archive inspection, and pair again under supervision.
4. **Database failure:** disable auto-reply, stop the application, validate
   credentials/network, and rehearse the approved backup on a non-production
   database before restoring production. Verify all critical tables, then
   start PostgreSQL, Ollama, backend, dashboard, and Nginx in that order.
5. **Unexpected messages:** set `WHATSAPP_AUTO_REPLY_KILL_SWITCH=true`, disable
   the database control, preserve audit/log evidence, and investigate before
   re-enabling any contact.

Record incident time, operator, commands, backup identifier, verification
results, and the rollback decision. Do not delete production data as a
recovery step.
