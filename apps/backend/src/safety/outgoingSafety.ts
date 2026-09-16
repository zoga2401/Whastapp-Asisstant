import { validateResponse } from '../ai/responseValidator';

const BROADCAST = /@broadcast|@g\.us/i;
const CONTROL = /(ignore (previous|all)|system prompt|developer message)/i;

export interface OutgoingSafetyResult { allowed: boolean; reason: string; text?: string; }

export function validateOutgoingReply(jid: string, text: unknown): OutgoingSafetyResult {
  if (!jid.endsWith('@s.whatsapp.net') || BROADCAST.test(jid)) return { allowed: false, reason: 'recipient_is_not_individual' };
  const validation = validateResponse(text, { maxLength: 800 });
  if (!validation.valid || CONTROL.test(validation.answer)) return { allowed: false, reason: validation.reason || 'unsafe_reply' };
  return { allowed: true, reason: 'approved', text: validation.answer };
}
