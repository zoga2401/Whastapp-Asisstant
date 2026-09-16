# Security checklist

- Keep `.env`, Baileys sessions, logs, and backup archives outside source
  control and outside the Next.js public directory.
- Use a dedicated least-privilege PostgreSQL role; do not expose PostgreSQL
  or Ollama directly to the internet.
- Use `DB_SSL=true` with certificate verification when PostgreSQL is remote.
- Keep dashboard/admin routes authenticated and enforce request-size and input
  validation. Restrict `/metrics` to trusted operators.
- Use HTTPS at Nginx, redirect HTTP to HTTPS, and enable the secure,
  HttpOnly, SameSite session cookie behavior already provided by the backend.
- Review logs for message bodies, passwords, tokens, database URLs, and
  session material before exporting them.
- Keep auto-reply disabled during initial rollout; use the kill switch and
  audit trail for emergency shutdown.
- Rotate secrets through the host's secret-management process. Never paste
  credentials into issues, commits, screenshots, or support logs.
