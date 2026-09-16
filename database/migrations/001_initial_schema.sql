-- =============================================================================
-- SKEMA AWAL DATABASE ZOGA ASSISTANT (TAHAP 1)
-- =============================================================================

-- Pastikan ekstensi UUID tersedia
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tabel Kontak (Menyimpan nomor WhatsApp, nama, dan relasi)
CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    jid VARCHAR(64) UNIQUE NOT NULL, -- Format: 628xxx@s.whatsapp.net
    phone_number VARCHAR(32) NOT NULL,
    name VARCHAR(255),
    push_name VARCHAR(255),
    category VARCHAR(32) DEFAULT 'customer', -- customer, friend, family, unknown
    is_admin BOOLEAN DEFAULT FALSE,
    ai_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index pencarian kontak cepat
CREATE INDEX IF NOT EXISTS idx_contacts_jid ON contacts(jid);
CREATE INDEX IF NOT EXISTS idx_contacts_category ON contacts(category);

-- 2. Tabel Percakapan / Sesi (State percakapan dan status handover)
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
    jid VARCHAR(64) NOT NULL,
    status VARCHAR(32) DEFAULT 'bot_active', -- bot_active, handover_required, admin_handling, resolved
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_conversations_jid ON conversations(jid);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);

-- 3. Tabel Pesan (Log riwayat chat untuk konteks AI)
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    wa_message_id VARCHAR(128) UNIQUE NOT NULL,
    from_me BOOLEAN NOT NULL DEFAULT FALSE,
    sender_jid VARCHAR(64) NOT NULL,
    content TEXT NOT NULL,
    is_ai_generated BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);

-- 4. Tabel Knowledge Base (Data primer bisnis & anti-halusinasi)
CREATE TABLE IF NOT EXISTS knowledge_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category VARCHAR(64) NOT NULL, -- profil_bisnis, produk, faq, aturan_layanan
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Tabel Pengaturan Sistem
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(64) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
