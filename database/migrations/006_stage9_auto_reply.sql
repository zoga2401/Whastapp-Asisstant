-- Stage 9: at-most-once auto-reply delivery reservation.
CREATE TABLE IF NOT EXISTS auto_reply_deliveries (
  incoming_message_id VARCHAR(128) PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  status VARCHAR(16) NOT NULL CHECK (status IN ('SENDING','SENT','FAILED')),
  outgoing_message_id VARCHAR(128),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_auto_reply_deliveries_conversation ON auto_reply_deliveries(conversation_id);
