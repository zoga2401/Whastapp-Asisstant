import type { ResponseAction } from '../ai/decisionEngine';
import type { AIConversationBundle } from '../ai/types';

export function isApprovedAutoReply(action: ResponseAction, bundle: AIConversationBundle): boolean {
  return action === 'AI_REPLY' &&
    bundle.rawContext.state.aiMode !== 'OFF' &&
    bundle.rawContext.state.aiAllowed !== false &&
    !bundle.rawContext.state.isAIPaused &&
    bundle.rawContext.state.status === 'ACTIVE' &&
    bundle.rawContext.state.lastSpeaker !== 'ADMIN' &&
    bundle.routing?.intent !== 'URGENT' &&
    !bundle.routing?.needsHandover;
}
