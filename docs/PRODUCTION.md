# Production guide

## Prerequisites

Use Node.js 20+, PostgreSQL 14+, Ollama with a small 1B–3B model, and a
supervised Baileys session. Keep PostgreSQL and Ollama on localhost or a
private network. Set `NODE_ENV=production`, a unique `ADMIN_SECRET_KEY`, and a
strong scrypt `ADMIN_DASHBOARD_PASSWORD_HASH`.

Build and validate before starting PM2:

```bash
cd apps/backend && npm ci && npm test && npm run typecheck && npm run build
cd ../dashboard && npm ci && npm run build
cd ../.. && pm2 start ecosystem.config.cjs && pm2 save
```

Do not use `npm run dev` in production. Put the API/dashboard behind the
reviewed Nginx HTTPS example in `ops/nginx/zoga.conf.example`; do not commit
certificates or private keys.

## Staged rollout

1. Start with `WHATSAPP_AUTO_REPLY_ENABLED=false` and AI disabled for all
   contacts. Verify migrations, dashboard authentication, `/health/ready`, and
   `/api/ai/health`.
2. Enable `HYBRID` for one to three approved contacts only. Observe audit
   events, intent/price correctness, duplicate protection, handover, latency,
   CPU, RAM, and disk.
3. Expand gradually. Keep the kill switch available and never enable mass
   auto-reply.

Rollback means stopping the new PM2 artifact, restoring the previous artifact,
and rerunning health checks. Never roll back by dropping production tables.
