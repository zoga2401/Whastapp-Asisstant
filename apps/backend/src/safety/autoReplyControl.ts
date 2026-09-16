import { dbPool } from '../config/database';
import { logger } from '../utils/logger';

export interface AutoReplyControl {
  enabled: boolean;
  emergency_shutdown: boolean;
  revision: number;
  updated_at: Date;
}

const DEFAULT_CONTROL: AutoReplyControl = {
  enabled: true,
  emergency_shutdown: false,
  revision: 0,
  updated_at: new Date(0),
};

export async function getAutoReplyControl(): Promise<AutoReplyControl> {
  const result = await dbPool.query<AutoReplyControl>(
    `SELECT enabled, emergency_shutdown, revision, updated_at
       FROM auto_reply_controls WHERE id = 1`,
  );
  return result.rows[0] || DEFAULT_CONTROL;
}

export async function setAutoReplyControl(
  patch: { enabled?: boolean; emergencyShutdown?: boolean },
  updatedBy: string,
): Promise<AutoReplyControl> {
  const result = await dbPool.query<AutoReplyControl>(
    `INSERT INTO auto_reply_controls (id, enabled, emergency_shutdown, revision, updated_by, updated_at)
     VALUES (1, COALESCE($1, TRUE), COALESCE($2, FALSE), 1, $3, CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO UPDATE SET
       enabled = COALESCE($1, auto_reply_controls.enabled),
       emergency_shutdown = COALESCE($2, auto_reply_controls.emergency_shutdown),
       revision = auto_reply_controls.revision + 1,
       updated_by = $3,
       updated_at = CURRENT_TIMESTAMP
     RETURNING enabled, emergency_shutdown, revision, updated_at`,
    [patch.enabled ?? null, patch.emergencyShutdown ?? null, updatedBy],
  );
  if (!result.rows[0]) throw new Error('Auto-reply control update returned no state');
  return result.rows[0];
}

export async function recordAutoReplyAudit(params: {
  eventType: string;
  reason?: string;
  incomingMessageId?: string;
  conversationId?: string;
  contactId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await dbPool.query(
    `INSERT INTO auto_reply_audit_events
      (incoming_message_id, conversation_id, contact_id, event_type, reason, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      params.incomingMessageId || null,
      params.conversationId || null,
      params.contactId || null,
      params.eventType,
      params.reason || null,
      JSON.stringify(params.metadata || {}),
    ],
  );
}

export async function auditOrThrow(params: Parameters<typeof recordAutoReplyAudit>[0]): Promise<void> {
  try {
    await recordAutoReplyAudit(params);
  } catch (error) {
    logger.error({ err: error, eventType: params.eventType }, '[AUTO-REPLY] Audit write failed');
    throw error;
  }
}
