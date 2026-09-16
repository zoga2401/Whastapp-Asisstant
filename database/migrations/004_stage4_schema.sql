-- =============================================================================
-- MIGRATION TAHAP 4: CONVERSATION STATE, MEMORY ITEMS & SUMMARIES
-- Aman untuk dijalankan pada database yang sudah berisi data Tahap 2 & 3.
-- Menggunakan ALTER TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
-- TIDAK ADA DROP TABLE atau DROP COLUMN.
-- =============================================================================

-- 1. Perbarui tabel conversations untuk tracking state dan last speaker
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS ai_paused_until TIMESTAMP WITH TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS last_speaker VARCHAR(16) NOT NULL DEFAULT 'USER',
  ADD COLUMN IF NOT EXISTS last_user_message_at TIMESTAMP WITH TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS last_admin_message_at TIMESTAMP WITH TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS last_ai_message_at TIMESTAMP WITH TIME ZONE NULL;

-- Index untuk query status & ai_paused_until
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_ai_paused_until ON conversations(ai_paused_until);

-- 2. Perbarui tabel messages untuk mendukung sender_type
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS sender_type VARCHAR(16) NOT NULL DEFAULT 'USER';

CREATE INDEX IF NOT EXISTS idx_messages_sender_type ON messages(sender_type);

-- 3. Tabel memory_items (Penyimpanan memori jangka panjang per kontak)
CREATE TABLE IF NOT EXISTS memory_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    type VARCHAR(32) NOT NULL DEFAULT 'OTHER', -- PERSONAL, BUSINESS, PREFERENCE, CONTEXT, OTHER
    key VARCHAR(128) NOT NULL,
    value TEXT NOT NULL,
    importance VARCHAR(16) NOT NULL DEFAULT 'MEDIUM', -- LOW, MEDIUM, HIGH
    source VARCHAR(16) NOT NULL DEFAULT 'ADMIN', -- ADMIN, SYSTEM, AI, USER
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_memory_items_contact_id ON memory_items(contact_id);
CREATE INDEX IF NOT EXISTS idx_memory_items_is_active ON memory_items(is_active);
CREATE INDEX IF NOT EXISTS idx_memory_items_importance ON memory_items(importance);

-- 4. Tabel conversation_summaries (Ringkasan percakapan panjang)
CREATE TABLE IF NOT EXISTS conversation_summaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    summary TEXT NOT NULL,
    message_start_id VARCHAR(128),
    message_end_id VARCHAR(128),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_conv_summaries_conv_id ON conversation_summaries(conversation_id);
