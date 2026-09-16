-- =============================================================================
-- SKEMA MIGRATION TAHAP 2: PENYESUAIAN STRUKTUR WHATSAPP, KONTAK, DAN PESAN
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Perbarui / Buat Tabel Contacts sesuai spesifikasi Tahap 2
CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(32) UNIQUE NOT NULL,
    whatsapp_jid VARCHAR(64) UNIQUE NOT NULL,
    whatsapp_name VARCHAR(255),
    custom_name VARCHAR(255),
    category VARCHAR(32) DEFAULT 'UNKNOWN', -- UNKNOWN, BUSINESS, dll.
    ai_enabled BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
CREATE INDEX IF NOT EXISTS idx_contacts_whatsapp_jid ON contacts(whatsapp_jid);
CREATE INDEX IF NOT EXISTS idx_contacts_category ON contacts(category);

-- 2. Perbarui / Buat Tabel Conversations
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
    status VARCHAR(32) DEFAULT 'ACTIVE', -- ACTIVE, CLOSED, HANDOVER
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_conversations_contact_id ON conversations(contact_id);

-- 3. Perbarui / Buat Tabel Messages sesuai spesifikasi Tahap 2
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    message_id VARCHAR(128) UNIQUE NOT NULL,
    direction VARCHAR(16) NOT NULL, -- INCOMING, OUTGOING
    sender_phone VARCHAR(32) NOT NULL,
    receiver_phone VARCHAR(32) NOT NULL,
    message_type VARCHAR(32) DEFAULT 'TEXT', -- TEXT, IMAGE, VIDEO, dll.
    message_text TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    is_from_me BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_message_id ON messages(message_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC);
