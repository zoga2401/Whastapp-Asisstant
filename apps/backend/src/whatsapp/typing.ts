import type { WASocket } from '@whiskeysockets/baileys';

export async function sendTyping(sock: WASocket, jid: string, enabled: boolean): Promise<void> {
  if (!enabled) return;
  await sock.sendPresenceUpdate('composing', jid);
}
