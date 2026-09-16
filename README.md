# Zoga Assistant 🤖

Sistem asisten pribadi WhatsApp berbasis AI lokal yang dirancang untuk berjalan di server pribadi (Debian 13 XFCE, Intel Core i3 Gen 2, RAM 8 GB).

---

## 📌 Status Pengembangan

- [x] **Tahap 1**: Fondasi arsitektur, Backend Node.js + TypeScript, Konfigurasi Environment, PostgreSQL Pool, Logging terstruktur (Pino), Error handling, dan Skrip pengujian database.
- [x] **Tahap 2**: Integrasi WhatsApp Web (Baileys), QR Pairing di terminal, Multi-file Auth Session persistent, Auto-save Kontak dengan pattern classifier (`KONS VALIS`, `CUST`), Auto-save Percakapan & Pesan (INCOMING & OUTGOING), Reconnect backoff, dan API programmatic pengiriman pesan manual.
- [ ] **Tahap 3**: Integrasi Local AI (Ollama) & Prompt Anti-Halusinasi.
- [x] **Tahap 4**: Knowledge Base & Logika Handover ke Admin.
- [x] **Tahap 5**: AI Lokal (Ollama) & Prompting Aman.
- [x] **Tahap 6**: Routing intent, keputusan respons/handover, dan draft-only AI.
- [x] **Tahap 8**: Response generator, decision engine, validator, fallback, dan pipeline draft-only.
- [x] **Tahap 9**: WhatsApp auto-reply engine fail-closed dengan deduplikasi, rate limit, loop guard, dan outgoing safety.

---

## ⚙️ Persyaratan Sistem

- **Sistem Operasi**: Debian 13 (atau distro Linux lainnya) / Windows (untuk development)
- **Node.js**: Versi `>= 20.x`
- **Database**: PostgreSQL `>= 14`
- **Process Manager**: PM2 (untuk server Debian 24 jam)

---

## 🚀 Panduan Instalasi & Eksekusi Tahap 2

### 1. Masuk ke Folder Backend & Install Dependensi
```bash
cd apps/backend
npm install
```

### 2. Siapkan File `.env`
Salin template `.env.example` ke `.env` di root project:
```bash
# Dari root project:
cp .env.example .env
```
Sesuaikan kredensial PostgreSQL Anda di `.env`:
```env
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=zoga_assistant
DB_USER=postgres
DB_PASSWORD=password_postgresql_anda
PORT=3000
```

### 3. Eksekusi Database Migration
Jalankan migrasi skema database Tahap 1 & 2 ke PostgreSQL:
```bash
# Migrasi Tahap 1 (Dasar)
sudo -u postgres psql -d zoga_assistant -f ../../database/migrations/001_initial_schema.sql

# Migrasi Tahap 2 (Contacts, Conversations, & Messages spesifik Baileys)
sudo -u postgres psql -d zoga_assistant -f ../../database/migrations/002_stage2_schema.sql
```

### 4. Menjalankan Backend & Pairing WhatsApp
Jalankan server backend:
```bash
# Mode Development:
npm run dev

# Atau Mode Production:
npm run build
npm start
```

**Proses Pairing QR Code**:
1. Terminal akan memunculkan QR code ASCII:
   ```text
   [WHATSAPP] QR Code dibuat. Silakan scan melalui aplikasi WhatsApp di HP:
   ```
2. Buka WhatsApp di smartphone Anda $\rightarrow$ Pilih menu titik tiga / Pengaturan $\rightarrow$ **Perangkat Tertaut (Linked Devices)** $\rightarrow$ **Tautkan Perangkat**.
3. Arahkan kamera HP ke QR code di terminal.
4. Setelah berhasil, terminal akan menampilkan:
   ```text
   =======================================================
   ✅ [WHATSAPP] Status: Connected! Siap menerima pesan.
   =======================================================
   ```
5. File kredensial sesi otomatis tersimpan di folder `session_baileys/`. Saat server direstart, Baileys akan langsung login secara otomatis tanpa memerlukan scan QR ulang.

---

## 🧪 Panduan Pengujian Fitur Tahap 2

### A. Menguji Pesan Masuk (Incoming Message)
1. Minta nomor WhatsApp lain mengirim pesan ke nomor WhatsApp Anda, misalnya:
   > *"Mas, CCTV 4 kamera berapa?"*
2. Terminal backend akan langsung mencetak log terstruktur:
   ```text
   =======================================================
   📥 [MSG IN]
   From   : 628123456789
   Name   : Budi
   Message: Mas, CCTV 4 kamera berapa?
   =======================================================
   ```
3. Sistem secara otomatis:
   - Membuat/mengupdate data di tabel `contacts`.
   - Menguji pattern nama (jika nama mengandung `KONS VALIS`, `CUST`, `CUSTOMER`, `CLIENT`, atau `SUPPLIER`, kategori diatur ke `BUSINESS`, jika tidak menjadi `UNKNOWN`).
   - Membuat sesi percakapan di tabel `conversations`.
   - Menyimpan isi pesan ke tabel `messages` dengan `direction = 'INCOMING'`.

### B. Menguji Pengiriman Pesan Keluar (Programmatic Send)
Anda dapat menguji pengiriman pesan manual (tanpa AI) melalui HTTP endpoint:
```bash
curl -X POST http://localhost:3000/api/messages/send \
  -H "Content-Type: application/json" \
  -d '{"phone": "628123456789", "text": "Halo! Pesan pengujian keluar dari Zoga Assistant."}'
```
Respons JSON:
```json
{
  "success": true,
  "message": "Pesan berhasil dikirim dan dicatat ke PostgreSQL",
  "data": {
    "direction": "OUTGOING",
    "receiver_phone": "628123456789",
    "message_text": "Halo! Pesan pengujian keluar dari Zoga Assistant.",
    "is_from_me": true
  }
}
```

### C. Memeriksa Data di PostgreSQL
Gunakan `psql` untuk memastikan data tersimpan rapi:
```bash
sudo -u postgres psql -d zoga_assistant
```
Kueri verifikasi:
```sql
-- Cek kontak yang otomatis dibuat
SELECT phone, whatsapp_name, custom_name, category, ai_enabled FROM contacts;

-- Cek riwayat pesan masuk dan keluar
SELECT message_id, direction, sender_phone, receiver_phone, message_text, timestamp FROM messages ORDER BY timestamp DESC LIMIT 5;

-- Cek percakapan aktif
SELECT * FROM conversations;
```

---

## 🧠 Tahap 4: Conversation Context & Memory

Tahap 4 menambahkan konteks percakapan yang aman dan terkendali untuk AI lokal:

- Riwayat pesan dapat diambil dengan filter `limit`, `startAt`, `endAt`, serta `senderTypes`/`directions`.
- `buildConversationContext()` menghasilkan payload terstruktur dengan:
  - `contact` (display name, kategori, ai mode, notes)
  - `state` (status percakapan, last speaker, AI paused, expiry)
  - `memories` (memori aktif yang relevan)
  - `summary` (ringkasan terakhir)
  - `recentMessages` (role-based history: USER / AI / ADMIN / SYSTEM)
- Admin takeover otomatis menandai percakapan sebagai `AI_PAUSED` selama timeout konfigurasi, lalu otomatis kembali ke `ACTIVE` saat masa jeda habis.
- Memori manual harus melewati validasi privasi: data OTP, password, PIN, token, dan kartu kredit otomatis ditolak.
- API memory dan conversation tersedia untuk CRUD, pause/resume, dan build context.

### Migrasi & index yang dipakai
```bash
sudo -u postgres psql -d zoga_assistant -f ../../database/migrations/004_stage4_schema.sql
```

### Contoh endpoint Tahap 4
```bash
curl "http://localhost:3000/api/conversations/<conversation_id>/context?messageLimit=20&memoryLimit=10"
curl -X POST http://localhost:3000/api/contacts/<contact_id>/memories \
  -H "Content-Type: application/json" \
  -d '{"key":"Preferensi","value":"Mau pemasangan pagi","type":"PREFERENCE","importance":"HIGH"}'
```

## 🧠 Tahap 5: AI Lokal dengan Ollama

Tahap 5 menambahkan komponen AI lokal dengan model yang dijalankan sepenuhnya di mesin sendiri melalui Ollama, tanpa cloud AI. Implementasinya mencakup:

- `apps/backend/src/ai/ollama.ts`: request generation ke `/api/generate`, health check `/api/tags`, timeout, retry terbatas, parser respons, fallback aman.
- `apps/backend/src/ai/context.ts`: evaluasi izin AI berdasarkan `AI mode OFF/AUTO/HYBRID` dan `AI_PAUSED`.
- `apps/backend/src/ai/prompt.ts`: build prompt dari riwayat, memori, ringkasan, dan pesan baru.
- `apps/backend/src/ai/response.ts`: sanitasi parsing JSON/plain-text, validasi respons, log minimal.
- `prompts/system.txt`: prompt sistem default yang menjaga keamanan privasi.
- `POST /api/ai/test` dan `GET /api/ai/health`: route uji AI untuk local runtime dengan proteksi placeholder bila `ADMIN_SECRET_KEY` belum diset.

### Konfigurasi AI
File `.env` mendukung variabel:
```env
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:3b
AI_REQUEST_TIMEOUT_MS=20000
AI_MAX_RETRIES=2
AI_TEMPERATURE=0.3
```

### Instalasi Ollama di Debian 13
```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama serve
# di terminal baru
ollama pull qwen2.5:3b
ollama list
```

### Opsi model yang umum dipakai
```bash
ollama pull llama3.2:3b
ollama pull qwen2.5:3b
ollama pull mistral:7b
```

Model kecil seperti `qwen2.5:3b` cocok untuk mesin ringan, lebih cepat, tetapi kurang halus untuk jawaban panjang. Model 7B lebih kuat tetapi lebih berat secara RAM/CPU. Untuk server 8 GB, pilih 3B/4B jika ingin stabilitas. Jangan klaim model sudah aktif jika `curl http://127.0.0.1:11434/api/tags` gagal.

### Uji AI lokal
```bash
curl http://localhost:3000/api/ai/health
curl -X POST http://localhost:3000/api/ai/test \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"<conversation_id>","userMessage":"Halo, saya butuh bantuan seputar instalasi CCTV"}'
```

### Batasan dan asumsi penting
- Tidak ada pengiriman otomatis ke WhatsApp; ini hanyalah generator jawaban AI yang siap digunakan secara manual.
- Tidak ada dashboard, RAG, vector DB, atau auto-reply yang ditambahkan.
- Jika runtime Ollama tidak tersedia, endpoint akan mengembalikan status `unavailable` dengan pesan jelas, bukan memalsukan koneksi.

## 🧭 Tahap 6: Routing & Draft-only

Tahap 6 mengklasifikasikan pesan menjadi `BUSINESS`, `PERSONAL`, `UNKNOWN`, atau
`URGENT`, lalu menghasilkan keputusan eksplisit `shouldRespond`,
`needsClarification`, `needsHandover`, dan `shouldNotRespond`. AI OFF,
AI_PAUSED, serta ADMIN_HANDOVER selalu memblokir respons otomatis. Pesan urgent
diarahkan ke admin.

`POST /api/ai/draft` menghasilkan keputusan dan draft jawaban dari pipeline
konteks Tahap 4/5. Endpoint ini tidak mengirim pesan WhatsApp, tidak melakukan
broadcast, dan seluruh hasil harus ditinjau/dikirim manual oleh admin.

## 🧠 Tahap 7: Knowledge Base Bisnis

Jalankan migration **tanpa seed fakta bisnis** (isi melalui admin):

```bash
sudo -u postgres psql -d zoga_assistant -f ../../database/migrations/005_stage7_knowledge_base.sql
```

Knowledge Base PostgreSQL mencakup produk/varian, layanan, harga aktif (dengan
`FIXED_PRICE`, `STARTING_PRICE`, `PRICE_RANGE`, atau `CONTACT_ADMIN`), area,
garansi, FAQ, dan aturan bisnis. Harga yang belum berlaku, sudah kedaluwarsa,
atau inactive tidak pernah dikirim ke prompt. Semua query menggunakan parameter
PostgreSQL dan dibatasi 100 baris.

Endpoint knowledge dilindungi `x-admin-key` atau header `Authorization: Bearer
<ADMIN_SECRET_KEY>` jika `ADMIN_SECRET_KEY` dikonfigurasi. Tanpa secret yang
aman, middleware tetap berada pada mode development placeholder.

```text
GET /api/knowledge/products
GET /api/knowledge/products/:id
GET /api/knowledge/services
GET /api/knowledge/prices
GET /api/knowledge/faqs
GET /api/knowledge/service-areas
GET /api/knowledge/warranties
GET /api/knowledge/search?q=harga%20cctv
POST/PATCH/DELETE /api/knowledge/{products|services|prices|faqs|service-areas|warranties|business-rules}
```

Pesan intent `BUSINESS` menjalankan normalisasi ringan Indonesia/Jawa, mencari
fakta database, lalu menambahkan `BUSINESS KNOWLEDGE` ke prompt. Intent personal
tidak melakukan lookup. Jika fakta tidak ditemukan, prompt melarang model
menebak dan meminta klarifikasi/admin. Pipeline tetap menghasilkan draft saja;
tidak ada auto-reply WhatsApp.

## 🧠 Tahap 8: Response Generator & Decision Engine

Pipeline Stage 8 berjalan berurutan: konteks percakapan → intent router → knowledge
base → decision engine → Ollama hanya bila diizinkan → response validator →
fallback aman. Decision engine menghasilkan `AI_REPLY`, `ASK_CLARIFICATION`,
`HANDOVER_ADMIN`, `IGNORE`, atau `WAIT`. Mode AI `OFF`, jeda/admin takeover,
pesan urgent, dan fakta bisnis yang tidak tersedia selalu diblokir dari Ollama.

Endpoint pengujian yang dilindungi admin:

```text
POST /api/ai/decision
POST /api/ai/respond
```

Keduanya hanya mengembalikan hasil/draft untuk review manual. Tahap ini tidak
menambahkan pengiriman WhatsApp, broadcast, atau auto-reply. Jalankan validasi
backend dari folder `apps/backend`:

```bash
npm test
npm run typecheck
npm run build
```

## 🛠️ Troubleshooting Umum

## 🛡️ Tahap 10: Safety, Anti-Loop, Rate Limit & Admin Control

Jalankan migration setelah `006_stage9_auto_reply.sql`:

```bash
sudo -u postgres psql -d zoga_assistant -f ../../database/migrations/007_stage10_safety_controls.sql
```

Tahap 10 menambahkan control global persisten, audit event, status delivery
idempoten, loop guard, rate window, contact policy (`ai_enabled` dan `ai_mode`),
admin takeover, serta pemeriksaan ulang tepat sebelum pengiriman Baileys.
Jika database, kontrol, koneksi, validasi, atau audit pra-kirim tidak pasti,
pengiriman diblokir. Delivery `SENDING`/`SENT`/`FAILED` tidak pernah dicoba ulang
oleh auto-reply sehingga kegagalan tidak berubah menjadi spam.

Endpoint admin yang dilindungi `x-admin-key` atau `Authorization: Bearer ...`:

```text
GET   /api/admin/auto-reply/control
PATCH /api/admin/auto-reply/control
```

Contoh emergency shutdown:

```bash
curl -X PATCH http://localhost:3000/api/admin/auto-reply/control \
  -H "x-admin-key: $ADMIN_SECRET_KEY" -H "Content-Type: application/json" \
  -d '{"emergencyShutdown":true}'
```

Auto-reply tetap opt-in dan kill switch environment tetap berlaku. Stage 10
tidak menambahkan broadcast, bulk messaging, retry pengiriman, atau dashboard.

## 🖥️ Tahap 11: Admin Dashboard

Dashboard ringan tersedia di `apps/dashboard` menggunakan Next.js dan hanya
berkomunikasi melalui backend API. Jalankan migration dashboard setelah Tahap 10:

```bash
sudo -u postgres psql -d zoga_assistant -f ../../database/migrations/008_stage11_admin_audit.sql
cd apps/dashboard
npm install
npm run build
npm start
```

Konfigurasikan `ADMIN_DASHBOARD_USERNAME` dan hash scrypt
`ADMIN_DASHBOARD_PASSWORD_HASH` pada `.env`. Backend menggunakan session cookie
HttpOnly/SameSite; secret tidak pernah dikirim ke frontend. Dashboard tidak
mengakses Baileys atau PostgreSQL secara langsung.

## 🚀 Tahap 12: Production Readiness & Recovery

Tahap 12 menambahkan integrasi mock/smoke test, probe kesehatan tanpa rahasia
(`GET /health/live`, `GET /health/ready`), metrik minimal (`GET /metrics`),
pool PostgreSQL yang dapat memakai TLS, PM2, contoh Nginx HTTPS, log rotation,
backup PostgreSQL dan Baileys, serta prosedur rollout/rollback. Tidak ada
perintah di tahap ini yang mengirim pesan WhatsApp atau melakukan operasi DB
destruktif.

Validasi lokal:

```bash
cd apps/backend
npm test
npm run typecheck
npm run build
```

Backup PostgreSQL memakai format custom. Restore hanya divalidasi dengan
`pg_restore --list`; skrip restore tidak terhubung ke database dan tidak
mengekstrak kredensial Baileys:

```powershell
.\scripts\postgres-backup.ps1
.\scripts\postgres-restore-dry-run.ps1 .\backups\postgres\<file>.dump
.\scripts\baileys-backup.ps1
.\scripts\baileys-restore-dry-run.ps1 .\backups\baileys\<file>.zip
```

Linux operators can use `scripts/backup-db.sh` and
`scripts/baileys-backup.sh`; both use restrictive file permissions and never
delete existing archives. Read `docs/PRODUCTION.md`, `docs/BACKUP.md`,
`docs/RECOVERY.md`, and `docs/SECURITY.md` together with
`ops/SECURITY_DEPLOYMENT_CHECKLIST.md` and `ops/RUNBOOK.md` before deployment.
`ecosystem.config.cjs`, `ops/nginx/zoga.conf.example`, and `ops/logrotate/zoga`
are examples that must be reviewed and adapted; never put certificates,
passwords, `.env`, Baileys sessions, or backups in Git.

## 🤖 Tahap 9: WhatsApp Auto Reply (Opt-in dan Fail-closed)

Tahap 9 adalah satu-satunya tahap yang boleh mengirim balasan AI secara otomatis.
Pengiriman selalu dibatasi pada pesan teks masuk dari **chat individual** (`@s.whatsapp.net`)
dan hanya action `AI_REPLY` yang lolos validator, policy, serta outgoing safety. Tidak ada
broadcast, bulk sender, group/status reply, scraping kontak, atau retry pengiriman.

Jalankan migration `database/migrations/006_stage9_auto_reply.sql` setelah migration
Tahap 7. Tabel `auto_reply_deliveries` menyimpan reservasi `SENDING/SENT/FAILED` per
ID pesan masuk untuk mencegah duplikasi (termasuk setelah restart). Jika reservasi,
konteks, Ollama, validasi, database, atau socket tidak pasti, sistem tidak mengirim.

Auto-reply **mati secara default**. Untuk mengaktifkan secara sadar:

```env
WHATSAPP_AUTO_REPLY_ENABLED=true
WHATSAPP_AUTO_REPLY_KILL_SWITCH=false
```

`WHATSAPP_AUTO_REPLY_KILL_SWITCH=true` langsung memblokir semua kiriman tanpa mengubah
API pengiriman manual. Batas konservatif default adalah 1 balasan per kontak per menit
dan 10 balasan global per menit; dapat diturunkan melalui `AUTO_REPLY_*`. Admin takeover,
`AI OFF`, `AI_PAUSED`, urgent/handover, no-reply, pesan non-individual, dan error tetap
tidak mengirim balasan. Typing indicator hanya dipakai sebelum kiriman yang sudah disetujui.

1. **QR Code berantakan di terminal**:
   - Perkecil ukuran font terminal Anda atau maksimalkan jendela terminal agar tampilan ASCII QR code tidak terpotong.
2. **Koneksi terputus tiba-tiba**:
   - Sistem dilengkapi fitur *auto-reconnect* dengan *exponential backoff* (3s, 6s, 12s...). Backend akan mencoba menyambung kembali secara otomatis tanpa perlu restart.
3. **Status "Logged Out" (Keluar dari perangkat)**:
   - Jika Anda sengaja memutuskan tautan dari HP, hapus folder `session_baileys/` lalu restart backend untuk men-generate QR code baru:
     ```bash
     rm -rf session_baileys/
     ```
