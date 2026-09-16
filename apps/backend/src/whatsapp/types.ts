export type MessageDirection = 'INCOMING' | 'OUTGOING';

export type MessageType = 
  | 'TEXT'
  | 'IMAGE'
  | 'VIDEO'
  | 'DOCUMENT'
  | 'AUDIO'
  | 'STICKER'
  | 'LOCATION'
  | 'CONTACT'
  | 'OTHER';

export type ContactCategory = 'UNKNOWN' | 'BUSINESS' | 'PERSONAL' | 'SUPPLIER' | 'OTHER';

export type CategorySource = 'PATTERN' | 'ADMIN' | 'AI' | 'MANUAL' | 'DEFAULT';

export type AIMode = 'OFF' | 'AUTO' | 'HYBRID';

// Tahap 4: Role & Sender Types
export type SenderType = 'USER' | 'AI' | 'ADMIN' | 'SYSTEM';

export type ConversationStatus = 'ACTIVE' | 'AI_PAUSED' | 'ADMIN_HANDOVER' | 'CLOSED';

export type LastSpeaker = 'USER' | 'ADMIN' | 'AI' | 'SYSTEM';

export type MemoryType = 'PERSONAL' | 'BUSINESS' | 'PREFERENCE' | 'CONTEXT' | 'OTHER';

export type MemoryImportance = 'LOW' | 'MEDIUM' | 'HIGH';

export type MemorySource = 'ADMIN' | 'SYSTEM' | 'AI' | 'USER';

export interface ContactRecord {
  id: string;
  phone: string;
  whatsapp_jid: string;
  whatsapp_name: string | null;
  custom_name: string | null;
  category: ContactCategory;
  category_source: CategorySource;
  ai_enabled: boolean;
  ai_mode: AIMode;
  notes: string | null;
  first_message_at: Date;
  last_message_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface ContactCategoryHistoryRecord {
  id: string;
  contact_id: string;
  old_category: string | null;
  new_category: string;
  source: CategorySource;
  reason: string | null;
  created_at: Date;
}

export interface ConversationRecord {
  id: string;
  contact_id: string;
  status: ConversationStatus;
  ai_paused_until: Date | null;
  last_speaker: LastSpeaker;
  last_user_message_at: Date | null;
  last_admin_message_at: Date | null;
  last_ai_message_at: Date | null;
  last_message_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface MessageRecord {
  id: string;
  conversation_id: string;
  message_id: string;
  direction: MessageDirection;
  sender_type: SenderType;
  sender_phone: string;
  receiver_phone: string;
  message_type: MessageType;
  message_text: string;
  timestamp: Date;
  is_from_me: boolean;
  created_at: Date;
}

export interface MemoryItemRecord {
  id: string;
  contact_id: string;
  conversation_id: string | null;
  type: MemoryType;
  key: string;
  value: string;
  importance: MemoryImportance;
  source: MemorySource;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ConversationSummaryRecord {
  id: string;
  conversation_id: string;
  summary: string;
  message_start_id: string | null;
  message_end_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface FormattedContextMessage {
  role: 'user' | 'assistant' | 'admin' | 'system';
  content: string;
  senderType?: SenderType;
  timestamp?: Date;
}

export interface ContactContext {
  displayName: string;
  category: ContactCategory;
  aiMode: AIMode;
  notes?: string | null;
  firstMessageAt?: Date;
  lastMessageAt?: Date;
}

export interface ConversationStateInfo {
  status: ConversationStatus;
  aiMode: AIMode;
  lastSpeaker: LastSpeaker;
  aiPausedUntil: Date | null;
  isAIPaused: boolean;
  aiAllowed?: boolean;
}

export interface ConversationContextPayload {
  conversationId: string;
  contact: ContactContext;
  state: ConversationStateInfo;
  memories: MemoryItemRecord[];
  summary?: string | null;
  recentMessages: FormattedContextMessage[];
}

export interface IncomingMessagePayload {
  messageId: string;
  senderJid: string;
  senderPhone: string;
  senderName: string | null;
  text: string;
  timestamp: Date;
  isFromMe: boolean;
}

export interface UpdateContactPayload {
  customName?: string | null;
  category?: ContactCategory;
  aiMode?: AIMode;
  aiEnabled?: boolean;
  notes?: string | null;
}
