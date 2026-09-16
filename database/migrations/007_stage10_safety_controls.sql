-- Stage 10: persistent safety controls and audit trail.
CREATE TABLE IF NOT EXISTS auto_reply_controls (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  emergency_shutdown BOOLEAN NOT NULL DEFAULT FALSE,
  revision BIGINT NOT NULL DEFAULT 0,
  updated_by VARCHAR(128),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO auto_reply_controls (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS auto_reply_audit_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  incoming_message_id VARCHAR(128),
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  event_type VARCHAR(64) NOT NULL,
  reason VARCHAR(255),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_auto_reply_audit_created_at ON auto_reply_audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auto_reply_audit_message ON auto_reply_audit_events(incoming_message_id);
CREATE INDEX IF NOT EXISTS idx_auto_reply_audit_conversation ON auto_reply_audit_events(conversation_id);

ALTER TABLE auto_reply_deliveries
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS failure_reason VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_auto_reply_deliveries_status ON auto_reply_deliveries(status);
