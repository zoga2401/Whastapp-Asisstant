-- =============================================================================
-- MIGRATION TAHAP 3: CONTACT INTELLIGENCE & CATEGORY HISTORY
-- Aman untuk dijalankan pada database yang sudah berisi data Tahap 2.
-- Semua operasi menggunakan ALTER TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
-- TIDAK ADA DROP TABLE atau DROP COLUMN.
-- =============================================================================

-- 1. Tambahkan kolom baru ke tabel contacts jika belum ada
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS category_source VARCHAR(32) NOT NULL DEFAULT 'DEFAULT',
  ADD COLUMN IF NOT EXISTS ai_mode         VARCHAR(16) NOT NULL DEFAULT 'OFF',
  ADD COLUMN IF NOT EXISTS first_message_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS last_message_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Pastikan kontrol integritas: kolom category punya DEFAULT 'UNKNOWN'
ALTER TABLE contacts
  ALTER COLUMN category SET DEFAULT 'UNKNOWN';

ALTER TABLE contacts
  ALTER COLUMN ai_enabled SET DEFAULT FALSE;

-- 2. Buat tabel contact_category_history untuk audit trail perubahan kategori
CREATE TABLE IF NOT EXISTS contact_category_history (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contact_id  UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    old_category VARCHAR(32),
    new_category VARCHAR(32) NOT NULL,
    source       VARCHAR(32) NOT NULL DEFAULT 'DEFAULT',
    reason       TEXT,
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cat_history_contact_id ON contact_category_history(contact_id);
CREATE INDEX IF NOT EXISTS idx_cat_history_created_at ON contact_category_history(created_at DESC);

-- 3. Index tambahan untuk pencarian kontak yang efisien
CREATE INDEX IF NOT EXISTS idx_contacts_category_source ON contacts(category_source);
CREATE INDEX IF NOT EXISTS idx_contacts_last_message_at ON contacts(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_whatsapp_name   ON contacts(whatsapp_name);
CREATE INDEX IF NOT EXISTS idx_contacts_custom_name     ON contacts(custom_name);
