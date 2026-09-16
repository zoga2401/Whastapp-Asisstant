-- =============================================================================
-- SEED DATA TAHAP 3: PATTERN AWAL CLASSIFIER
-- Menyimpan daftar pattern klasifikasi kontak ke tabel system_settings
-- sebagai konfigurasi yang dapat diperbarui tanpa mengubah source code.
-- =============================================================================

-- Pastikan tabel system_settings ada
CREATE TABLE IF NOT EXISTS system_settings (
    key         VARCHAR(64) PRIMARY KEY,
    value       JSONB NOT NULL,
    description TEXT,
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed pattern BUSINESS
INSERT INTO system_settings (key, value, description)
VALUES (
  'classifier_business_patterns',
  '["kons valis", "cust", "customer", "client"]'::jsonb,
  'Pola nama kontak yang diklasifikasikan sebagai BUSINESS (case-insensitive, word boundary matching)'
)
ON CONFLICT (key) DO UPDATE
  SET value      = EXCLUDED.value,
      updated_at = CURRENT_TIMESTAMP;

-- Seed pattern SUPPLIER
INSERT INTO system_settings (key, value, description)
VALUES (
  'classifier_supplier_patterns',
  '["supplier", "vendor"]'::jsonb,
  'Pola nama kontak yang diklasifikasikan sebagai SUPPLIER (case-insensitive, word boundary matching)'
)
ON CONFLICT (key) DO UPDATE
  SET value      = EXCLUDED.value,
      updated_at = CURRENT_TIMESTAMP;

-- Seed konfigurasi AI default
INSERT INTO system_settings (key, value, description)
VALUES (
  'ai_default_config',
  '{"ai_enabled": false, "ai_mode": "OFF", "default_category": "UNKNOWN"}'::jsonb,
  'Konfigurasi default AI untuk kontak baru'
)
ON CONFLICT (key) DO UPDATE
  SET value      = EXCLUDED.value,
      updated_at = CURRENT_TIMESTAMP;
