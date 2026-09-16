import express, { Request, Response } from 'express';
import { env } from './config/env';
import { logger } from './utils/logger';
import { checkDatabaseHealth, closeDatabasePool } from './config/database';
import { errorHandler, setupProcessErrorHandlers, AppError } from './utils/errors';
import {
  initWhatsAppConnection,
  getWhatsAppConnectionStatus,
  sendTextMessage,
  getActiveSocket,
  getAllContacts,
  getContactById,
  searchContacts,
  updateContact,
  getConversationById,
  getConversationsByContactId,
  getMessagesByConversationId,
  getContactDisplayName,
  buildConversationContext,
  pauseConversationAI,
  resumeConversationAI,
  createMemoryItem,
  updateMemoryItem,
  deleteMemoryItem,
  getRelevantMemories,
  ContactCategory,
  AIMode,
  MemoryType,
  MemoryImportance,
  MemorySource,
} from './whatsapp';
import { checkOllamaHealth, processAIRequest } from './ai/ollama';
import { searchKnowledge } from './knowledge';
import { listKnowledge, getKnowledge, createKnowledge, updateKnowledge, deleteKnowledge } from './knowledge/knowledgeAdminService';
import { dbPool } from './config/database';
import { auditOrThrow } from './safety/autoReplyControl';
import { getAutoReplyControl, setAutoReplyControl } from './safety/autoReplyControl';
import { login, logout, hasAdminSession, requireAdminSession } from './admin/auth';

// Pasang uncaught exception & unhandled rejection listeners
setupProcessErrorHandlers();

const app = express();

const parsePositiveInt = (value: unknown, fallback: number, fieldName: string, allowZero = false): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  if (allowZero && parsed >= 0) {
    return Math.floor(parsed);
  }

  if (parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
};

const maybeProtectAIRequest = (req: Request): { authorized: boolean; protection: string } => {
  const adminSecret = env.ADMIN_SECRET_KEY?.trim();
  const configured = Boolean(adminSecret && adminSecret !== 'default_insecure_key_change_me');
  const headerKey = req.get('x-admin-key') || req.get('authorization')?.replace(/^Bearer\s+/i, '') || '';

  if (!configured) {
    return {
      authorized: true,
      protection: 'placeholder-dev-only: set ADMIN_SECRET_KEY for production auth gating',
    };
  }

  return {
    authorized: headerKey === adminSecret || hasAdminSession(req),
    protection: 'admin-secret-required',
  };
};
const requireKnowledgeAdmin = (req: Request, res: Response): boolean => {
  const protection = maybeProtectAIRequest(req);
  if (!protection.authorized) { res.status(401).json({ success:false, message:'Admin auth required.', protection }); return false; }
  return true;
};

// Middleware dasar hemat resource
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Logging request sederhana
app.use((req: Request, _res: Response, next) => {
  logger.debug({ method: req.method, url: req.url }, 'Incoming HTTP request');
  next();
});

app.post('/api/admin/auth/login', (req: Request, res: Response) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || typeof password !== 'string' || !login(username, password, res)) {
    res.status(401).json({ success: false, message: 'Invalid credentials.' });
    return;
  }
  res.json({ success: true, data: { username } });
});
app.post('/api/admin/auth/logout', (req: Request, res: Response) => { logout(req, res); res.json({ success: true }); });
app.get('/api/admin/auth/session', requireAdminSession, (_req, res) => res.json({ success: true }));

// Root ping endpoint
app.get('/', (_req: Request, res: Response) => {
  const isWaConnected = Boolean(getActiveSocket());
  res.json({
    app: 'Zoga Assistant Backend',
    status: 'running',
    whatsappConnected: isWaConnected,
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Endpoint Health check sistem & koneksi database
app.get('/health', async (_req: Request, res: Response) => {
  const dbHealth = await checkDatabaseHealth();
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();
  const isWaConnected = Boolean(getActiveSocket());

  const responsePayload = {
    status: dbHealth.ok ? 'healthy' : 'degraded',
    uptimeSeconds: Math.floor(uptime),
    memoryUsageMB: {
      rss: Math.round(memoryUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
    },
    database: dbHealth,
    whatsapp: {
      connected: isWaConnected,
    },
  };

  const ready = dbHealth.ok && (!env.HEALTH_REQUIRE_WHATSAPP || isWaConnected);
  res.status(ready ? 200 : 503).json(responsePayload);
});

// Kubernetes/load-balancer probes: liveness never depends on external services.
app.get('/health/live', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', uptimeSeconds: Math.floor(process.uptime()) });
});

app.get('/health/ready', async (_req: Request, res: Response) => {
  const dbHealth = await checkDatabaseHealth();
  const whatsappReady = !env.HEALTH_REQUIRE_WHATSAPP || Boolean(getActiveSocket());
  const ready = dbHealth.ok && whatsappReady;
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not_ready',
    database: { ok: dbHealth.ok },
    whatsapp: { connected: Boolean(getActiveSocket()) },
  });
});

// Minimal Prometheus-compatible metrics without message contents or credentials.
app.get('/metrics', (_req: Request, res: Response) => {
  res.type('text/plain').send([
    '# HELP zoga_process_uptime_seconds Process uptime in seconds',
    '# TYPE zoga_process_uptime_seconds gauge',
    `zoga_process_uptime_seconds ${process.uptime()}`,
    '# HELP zoga_whatsapp_connected WhatsApp socket connection state',
    '# TYPE zoga_whatsapp_connected gauge',
    `zoga_whatsapp_connected ${getActiveSocket() ? 1 : 0}`,
  ].join('\n') + '\n');
});

app.get('/api/whatsapp/status', (_req: Request, res: Response) => {
  res.json({ status: getWhatsAppConnectionStatus() });
});

const requireDashboardAdmin = (req: Request, res: Response): boolean => {
  if (!requireKnowledgeAdmin(req, res)) return false;
  return true;
};

app.get('/api/admin/dashboard/audit', async (req, res, next) => {
  try {
    if (!requireDashboardAdmin(req, res)) return;
    const limit = parsePositiveInt(req.query.limit, 50, 'limit');
    const offset = parsePositiveInt(req.query.offset, 0, 'offset', true);
    const result = await dbPool.query(
      `SELECT id, actor, action, resource_type, resource_id, metadata, created_at
       FROM admin_audit_events ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [Math.min(limit, 100), offset],
    );
    res.json({ success: true, data: result.rows, pagination: { limit: Math.min(limit, 100), offset } });
  } catch (error) { next(error); }
});

app.get('/api/admin/dashboard/conversations', async (req, res, next) => {
  try {
    if (!requireDashboardAdmin(req, res)) return;
    const limit = Math.min(parsePositiveInt(req.query.limit, 20, 'limit'), 50);
    const offset = parsePositiveInt(req.query.offset, 0, 'offset', true);
    const search = typeof req.query.search === 'string' ? `%${req.query.search.trim()}%` : null;
    const result = await dbPool.query(
      `SELECT c.*, co.phone, co.whatsapp_name, co.custom_name
       FROM conversations c JOIN contacts co ON co.id = c.contact_id
       WHERE ($1::text IS NULL OR co.phone ILIKE $1 OR co.whatsapp_name ILIKE $1 OR co.custom_name ILIKE $1)
       ORDER BY c.updated_at DESC LIMIT $2 OFFSET $3`,
      [search || null, limit, offset],
    );
    res.json({ success: true, data: result.rows, pagination: { limit, offset } });
  } catch (error) { next(error); }
});

app.post('/api/admin/dashboard/conversations/:id/takeover', async (req, res, next) => {
  try {
    if (!requireDashboardAdmin(req, res)) return;
    const result = await dbPool.query(
      `UPDATE conversations SET status='ADMIN_HANDOVER', ai_paused_until=NULL, updated_at=CURRENT_TIMESTAMP
       WHERE id=$1 RETURNING *`, [req.params.id],
    );
    if (!result.rows[0]) { res.status(404).json({ success: false, message: 'Conversation tidak ditemukan.' }); return; }
    await auditOrThrow({ eventType: 'ADMIN_TAKEOVER', conversationId: req.params.id, reason: 'dashboard_takeover' });
    await dbPool.query(`INSERT INTO admin_audit_events (actor, action, resource_type, resource_id) VALUES ($1,$2,$3,$4)`,
      [req.get('x-admin-actor') || 'dashboard-admin', 'ADMIN_TAKEOVER', 'conversation', req.params.id]);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

app.post('/api/admin/dashboard/conversations/:id/release', async (req, res, next) => {
  try {
    if (!requireDashboardAdmin(req, res)) return;
    const result = await dbPool.query(
      `UPDATE conversations SET status='ACTIVE', ai_paused_until=NULL, updated_at=CURRENT_TIMESTAMP
       WHERE id=$1 RETURNING *`, [req.params.id],
    );
    if (!result.rows[0]) { res.status(404).json({ success: false, message: 'Conversation tidak ditemukan.' }); return; }
    await dbPool.query(`INSERT INTO admin_audit_events (actor, action, resource_type, resource_id) VALUES ($1,$2,$3,$4)`,
      [req.get('x-admin-actor') || 'dashboard-admin', 'ADMIN_RELEASE', 'conversation', req.params.id]);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

// Stage 10: protected operational controls. These endpoints never send messages.
app.get('/api/admin/auto-reply/control', (req: Request, res: Response) => {
  const protection = maybeProtectAIRequest(req);
  if (!protection.authorized) { res.status(401).json({ success: false, message: 'Admin auth required.', protection }); return; }
  getAutoReplyControl().then((control) => res.json({ success: true, data: control, protection })).catch((error) => {
    logger.error({ err: error }, '[ADMIN] Failed to read auto-reply control');
    res.status(503).json({ success: false, message: 'Control state unavailable.' });
  });
});

app.patch('/api/admin/auto-reply/control', async (req: Request, res: Response, next) => {
  try {
    const protection = maybeProtectAIRequest(req);
    if (!protection.authorized) { res.status(401).json({ success: false, message: 'Admin auth required.', protection }); return; }
    const body = req.body ?? {};
    if (typeof body.enabled !== 'undefined' && typeof body.enabled !== 'boolean') throw new AppError('"enabled" must be boolean', 400);
    if (typeof body.emergencyShutdown !== 'undefined' && typeof body.emergencyShutdown !== 'boolean') throw new AppError('"emergencyShutdown" must be boolean', 400);
    const actor = req.get('x-admin-actor')?.trim() || 'admin-api';
    const control = await setAutoReplyControl({ enabled: body.enabled, emergencyShutdown: body.emergencyShutdown }, actor);
    res.json({ success: true, data: control, protection });
  } catch (error) { next(error); }
});

// =============================================================================
// AI ROUTES (TAHAP 5)
// =============================================================================
app.get('/api/ai/health', async (req: Request, res: Response, next) => {
  try {
    const protection = maybeProtectAIRequest(req);
    if (!protection.authorized) {
      res.status(401).json({
        success: false,
        message: 'Admin auth required for AI endpoints when ADMIN_SECRET_KEY is configured.',
        protection,
      });
      return;
    }

    const health = await checkOllamaHealth();
    res.json({
      success: health.ok,
      data: {
        ...health,
        protection,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Tahap 6: routing + draft only. Endpoint ini tidak memanggil Baileys atau
// mengirim pesan; hasilnya selalu berupa keputusan dan draft untuk review admin.
app.post('/api/ai/draft', async (req: Request, res: Response, next) => {
  try {
    const protection = maybeProtectAIRequest(req);
    if (!protection.authorized) {
      res.status(401).json({ success: false, message: 'Admin auth required.', protection });
      return;
    }

    const { conversationId, userMessage } = req.body ?? {};
    if (!conversationId || typeof conversationId !== 'string' || !userMessage || typeof userMessage !== 'string') {
      throw new AppError('Field "conversationId" dan "userMessage" wajib diisi', 400);
    }

    const result = await processAIRequest(conversationId, userMessage);
    res.status(200).json({ success: result.success, data: { ...result, draftOnly: true, protection } });
  } catch (error) {
    next(error);
  }
});

// Tahap 8: endpoint eksplisit untuk menguji decision engine dan generator.
// Seperti /draft, endpoint ini hanya mengembalikan hasil untuk review manual.
for (const route of ['/api/ai/decision', '/api/ai/respond']) {
  app.post(route, async (req: Request, res: Response, next) => {
    try {
      const protection = maybeProtectAIRequest(req);
      if (!protection.authorized) {
        res.status(401).json({ success: false, message: 'Admin auth required.', protection });
        return;
      }
      const { conversationId, userMessage } = req.body ?? {};
      if (!conversationId || typeof conversationId !== 'string' || !userMessage || typeof userMessage !== 'string') {
        throw new AppError('Field "conversationId" dan "userMessage" wajib diisi', 400);
      }
      const result = await processAIRequest(conversationId, userMessage);
      res.status(200).json({
        success: result.success,
        data: { ...result, draftOnly: true, protection },
      });
    } catch (error) {
      next(error);
    }
  });
}

app.post('/api/ai/test', async (req: Request, res: Response, next) => {
  try {
    const protection = maybeProtectAIRequest(req);
    if (!protection.authorized) {
      res.status(401).json({
        success: false,
        message: 'Admin auth required for AI endpoints when ADMIN_SECRET_KEY is configured.',
        protection,
      });

      return;
    }

    const { conversationId, userMessage } = req.body ?? {};
    if (!conversationId || typeof conversationId !== 'string') {
      throw new AppError('Field "conversationId" wajib diisi', 400);
    }
    if (!userMessage || typeof userMessage !== 'string' || userMessage.trim() === '') {
      throw new AppError('Field "userMessage" wajib diisi dan berupa string', 400);
    }

    const result = await processAIRequest(conversationId, userMessage);
    const httpStatus = result.success || result.status === 'blocked' || result.status === 'paused' ? 200 : 503;

    res.status(httpStatus).json({
      success: result.success,
      data: {
        ...result,
        protection,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Tahap 7: read and admin CRUD. No endpoint sends WhatsApp messages.
const knowledgeTables = ['products','services','prices','faqs','service-areas','warranties','business-rules'];
const tableName = (value:string) => ({ products:'products', services:'services', prices:'price_lists', faqs:'faqs', 'service-areas':'service_areas', warranties:'warranties', 'business-rules':'business_rules' } as Record<string,string>)[value];
for (const resource of knowledgeTables) {
  app.get(`/api/knowledge/${resource}`, async (req, res, next) => {
    try { if (!requireKnowledgeAdmin(req,res)) return; const data=await listKnowledge(tableName(resource), parsePositiveInt(req.query.limit,50,'limit'), parsePositiveInt(req.query.offset,0,'offset',true)); res.json({success:true,data}); } catch(e){next(e);}
  });
  app.get(`/api/knowledge/${resource}/:id`, async (req,res,next) => {
    try { if (!requireKnowledgeAdmin(req,res)) return; const data=await getKnowledge(tableName(resource),req.params.id); if(!data){res.status(404).json({success:false,message:'Knowledge tidak ditemukan'});return;} res.json({success:true,data}); } catch(e){next(e);}
  });
  app.post(`/api/knowledge/${resource}`, async (req,res,next) => {
    try { if (!requireKnowledgeAdmin(req,res)) return; if(!req.body || typeof req.body!=='object') throw new AppError('Body knowledge tidak valid',400); const data=await createKnowledge(tableName(resource),req.body); res.status(201).json({success:true,data}); } catch(e){next(e);}
  });
  app.patch(`/api/knowledge/${resource}/:id`, async (req,res,next) => {
    try { if (!requireKnowledgeAdmin(req,res)) return; const data=await updateKnowledge(tableName(resource),req.params.id,req.body); if(!data){res.status(404).json({success:false,message:'Knowledge tidak ditemukan'});return;} res.json({success:true,data}); } catch(e){next(e);}
  });
  app.delete(`/api/knowledge/${resource}/:id`, async (req,res,next) => {
    try { if (!requireKnowledgeAdmin(req,res)) return; await deleteKnowledge(tableName(resource),req.params.id); res.json({success:true}); } catch(e){next(e);}
  });
}
app.get('/api/knowledge/search', async (req,res,next) => {
  try { if (!requireKnowledgeAdmin(req,res)) return; const q=typeof req.query.q==='string'?req.query.q.trim():''; if(!q) throw new AppError('Query parameter "q" wajib diisi',400); res.json({success:true,data:await searchKnowledge(q)}); } catch(e){next(e);}
});

// =============================================================================
// API KONTAK & CONVERSATION (TAHAP 3 & 4)
// =============================================================================

// GET /api/contacts - Mengambil semua kontak dengan display name
app.get('/api/contacts', async (req: Request, res: Response, next) => {
  try {
    const limit = parsePositiveInt(req.query.limit, 50, 'limit');
    const offset = parsePositiveInt(req.query.offset, 0, 'offset', true);
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const contacts = search ? await searchContacts(search) : await getAllContacts(limit, offset);

    const formatted = contacts.map((c) => ({
      ...c,
      displayName: getContactDisplayName(c),
    }));

    res.json({
      success: true,
      data: formatted,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/contacts/search?q=keyword - Pencarian kontak
app.get('/api/contacts/search', async (req: Request, res: Response, next) => {
  try {
    const query = req.query.q as string;
    if (!query || query.trim() === '') {
      throw new AppError('Query parameter "q" tidak boleh kosong', 400);
    }

    const contacts = await searchContacts(query);
    const formatted = contacts.map((c) => ({
      ...c,
      displayName: getContactDisplayName(c),
    }));

    res.json({
      success: true,
      data: formatted,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/contacts/:id - Mengambil detail satu kontak
app.get('/api/contacts/:id', async (req: Request, res: Response, next) => {
  try {
    const contact = await getContactById(req.params.id);
    if (!contact) {
      res.status(404).json({
        success: false,
        error: {
          code: 'CONTACT_NOT_FOUND',
          message: 'Contact tidak ditemukan',
        },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        ...contact,
        displayName: getContactDisplayName(contact),
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/contacts/:id/update - Update kontak oleh admin
app.post('/api/contacts/:id/update', async (req: Request, res: Response, next) => {
  try {
    if (!requireKnowledgeAdmin(req, res)) return;
    const { customName, category, aiMode, aiEnabled, notes } = req.body;

    const validCategories: ContactCategory[] = ['UNKNOWN', 'BUSINESS', 'PERSONAL', 'SUPPLIER', 'OTHER'];
    if (category && !validCategories.includes(category)) {
      throw new AppError(`Kategori tidak valid: ${category}. Pilihan: ${validCategories.join(', ')}`, 400);
    }

    const validAiModes: AIMode[] = ['OFF', 'AUTO', 'HYBRID'];
    if (aiMode && !validAiModes.includes(aiMode)) {
      throw new AppError(`ai_mode tidak valid: ${aiMode}. Pilihan: ${validAiModes.join(', ')}`, 400);
    }

    const updated = await updateContact(req.params.id, {
      customName,
      category,
      aiMode,
      aiEnabled,
      notes,
    });

    res.json({
      success: true,
      message: 'Kontak berhasil diperbarui oleh admin',
      data: {
        ...updated,
        displayName: getContactDisplayName(updated),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/contacts/:id/conversations - Mengambil percakapan dari suatu kontak
app.get('/api/contacts/:id/conversations', async (req: Request, res: Response, next) => {
  try {
    const conversations = await getConversationsByContactId(req.params.id);
    res.json({
      success: true,
      data: conversations,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/conversations/:id - Mengambil detail conversation
app.get('/api/conversations/:id', async (req: Request, res: Response, next) => {
  try {
    const conv = await getConversationById(req.params.id);
    if (!conv) {
      res.status(404).json({
        success: false,
        error: { code: 'CONVERSATION_NOT_FOUND', message: 'Conversation tidak ditemukan' },
      });
      return;
    }
    res.json({ success: true, data: conv });
  } catch (error) {
    next(error);
  }
});

// GET /api/conversations/:id/messages - Mengambil pesan dalam percakapan (oldest -> newest)
app.get('/api/conversations/:id/messages', async (req: Request, res: Response, next) => {
  try {
    const limit = parsePositiveInt(req.query.limit, env.CONTEXT_MESSAGE_LIMIT || 20, 'limit');
    const messages = await getMessagesByConversationId(req.params.id, limit);
    res.json({
      success: true,
      data: messages,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/conversations/:id/context - Mengambil conversation context lengkap untuk AI
app.get('/api/conversations/:id/context', async (req: Request, res: Response, next) => {
  try {
    const messageLimit = parsePositiveInt(req.query.messageLimit, env.CONTEXT_MESSAGE_LIMIT || 20, 'messageLimit');
    const memoryLimit = parsePositiveInt(req.query.memoryLimit, env.MEMORY_LIMIT || 10, 'memoryLimit');
    const context = await buildConversationContext(req.params.id, { messageLimit, memoryLimit });
    res.json({
      success: true,
      data: context,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/conversations/:id/state - Mengambil status state, AI pause & last speaker
app.get('/api/conversations/:id/state', async (req: Request, res: Response, next) => {
  try {
    const conv = await getConversationById(req.params.id);
    if (!conv) {
      res.status(404).json({
        success: false,
        error: { code: 'CONVERSATION_NOT_FOUND', message: 'Conversation tidak ditemukan' },
      });
      return;
    }

    const contact = await getContactById(conv.contact_id);
    const isPaused = conv.status === 'AI_PAUSED' && (!conv.ai_paused_until || new Date(conv.ai_paused_until) > new Date());
    const aiAllowed = contact ? contact.ai_mode !== 'OFF' && !isPaused : false;

    res.json({
      success: true,
      data: {
        conversationId: conv.id,
        status: conv.status,
        lastSpeaker: conv.last_speaker,
        aiMode: contact ? contact.ai_mode : 'OFF',
        aiPausedUntil: conv.ai_paused_until,
        isAIPaused: isPaused,
        aiAllowed,
        lastUserMessageAt: conv.last_user_message_at,
        lastAdminMessageAt: conv.last_admin_message_at,
        lastAIMessageAt: conv.last_ai_message_at,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/conversations/:id/pause-ai - Pause AI secara manual
app.post('/api/conversations/:id/pause-ai', async (req: Request, res: Response, next) => {
  try {
    const minutes = parsePositiveInt(req.body?.minutes, env.ADMIN_TAKEOVER_TIMEOUT_MINUTES || 30, 'minutes');
    const conv = await pauseConversationAI(req.params.id, minutes);
    res.json({
      success: true,
      message: `AI berhasil di-pause selama ${minutes} menit`,
      data: conv,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/conversations/:id/resume-ai - Resume AI kembali ke ACTIVE
app.post('/api/conversations/:id/resume-ai', async (req: Request, res: Response, next) => {
  try {
    const conv = await resumeConversationAI(req.params.id);
    res.json({
      success: true,
      message: 'AI berhasil di-resume menjadi ACTIVE',
      data: conv,
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// API MEMORY ITEMS (TAHAP 4)
// =============================================================================

// GET /api/contacts/:id/memories - Mengambil memori aktif suatu kontak
app.get('/api/contacts/:id/memories', async (req: Request, res: Response, next) => {
  try {
    const limit = parsePositiveInt(req.query.limit, env.MEMORY_LIMIT || 10, 'limit');
    const memories = await getRelevantMemories(req.params.id, limit);
    res.json({
      success: true,
      data: memories,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/contacts/:id/memories - Menambahkan item memori baru
app.post('/api/contacts/:id/memories', async (req: Request, res: Response, next) => {
  try {
    const { key, value, type, importance, source, conversationId } = req.body;
    if (!key || typeof key !== 'string' || key.trim() === '') {
      throw new AppError('Field "key" wajib diisi dan berupa string', 400);
    }
    if (!value || typeof value !== 'string' || value.trim() === '') {
      throw new AppError('Field "value" wajib diisi dan berupa string', 400);
    }

    const validTypes: MemoryType[] = ['PERSONAL', 'BUSINESS', 'PREFERENCE', 'CONTEXT', 'OTHER'];
    if (type && !validTypes.includes(type)) {
      throw new AppError(`Tipe memori tidak valid: ${type}`, 400);
    }

    const validImportances: MemoryImportance[] = ['LOW', 'MEDIUM', 'HIGH'];
    if (importance && !validImportances.includes(importance)) {
      throw new AppError(`Tingkat kepentingan tidak valid: ${importance}`, 400);
    }

    const validSources: MemorySource[] = ['ADMIN', 'SYSTEM', 'AI', 'USER'];
    if (source && !validSources.includes(source)) {
      throw new AppError(`Sumber memori tidak valid: ${source}`, 400);
    }

    const memory = await createMemoryItem({
      contactId: req.params.id,
      conversationId,
      key: key.trim(),
      value: value.trim(),
      type,
      importance,
      source: source || 'ADMIN',
    });

    res.status(201).json({
      success: true,
      message: 'Memory berhasil disimpan',
      data: memory,
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/contacts/:id/memories/:memoryId - Update memory
app.patch('/api/contacts/:id/memories/:memoryId', async (req: Request, res: Response, next) => {
  try {
    const { key, value, type, importance, isActive } = req.body;
    const updated = await updateMemoryItem(req.params.memoryId, {
      key,
      value,
      type,
      importance,
      isActive,
    });

    res.json({
      success: true,
      message: 'Memory berhasil diperbarui',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/contacts/:id/memories/:memoryId - Hapus memory
app.delete('/api/contacts/:id/memories/:memoryId', async (req: Request, res: Response, next) => {
  try {
    const hardDelete = req.query.hard === 'true';
    await deleteMemoryItem(req.params.memoryId, hardDelete);
    res.json({
      success: true,
      message: 'Memory berhasil dihapus',
    });
  } catch (error) {
    next(error);
  }
});

// Endpoint Programmatic untuk menguji pengiriman pesan manual keluar (OUTGOING)
app.post('/api/messages/send', async (req: Request, res: Response, next) => {
  try {
    if (!requireKnowledgeAdmin(req, res)) return;
    const { phone, text } = req.body;
    if (!phone || !text) {
      throw new AppError('Field "phone" dan "text" wajib disertakan', 400);
    }

    const savedMessage = await sendTextMessage(phone, text);
    res.json({
      success: true,
      message: 'Pesan berhasil dikirim dan dicatat ke PostgreSQL',
      data: savedMessage,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/dashboard/conversations/:id/reply', async (req, res, next) => {
  try {
    if (!requireDashboardAdmin(req, res)) return;
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text) throw new AppError('Field "text" wajib diisi.', 400);
    const conversation = await getConversationById(req.params.id);
    if (!conversation) { res.status(404).json({ success: false, message: 'Conversation tidak ditemukan.' }); return; }
    const contact = await getContactById(conversation.contact_id);
    if (!contact) { res.status(404).json({ success: false, message: 'Contact tidak ditemukan.' }); return; }
    const saved = await sendTextMessage(contact.phone, text);
    await dbPool.query(`INSERT INTO admin_audit_events (actor, action, resource_type, resource_id, metadata) VALUES ($1,$2,$3,$4,$5::jsonb)`,
      [req.get('x-admin-actor') || 'dashboard-admin', 'ADMIN_REPLY', 'conversation', req.params.id, JSON.stringify({ messageId: saved.message_id })]);
    res.status(201).json({ success: true, data: saved });
  } catch (error) { next(error); }
});

// Rute 404 handler
app.use((req: Request, _res: Response, next) => {
  next(new AppError(`Rute tidak ditemukan: ${req.method} ${req.originalUrl}`, 404));
});

// Global Express Error Handler
app.use(errorHandler);

// Jalankan Server & Inisialisasi WhatsApp
const server = app.listen(env.PORT, env.HOST, async () => {
  logger.info(`=======================================================`);
  logger.info(`🚀 Zoga Assistant Backend berjalan pada port ${env.PORT}`);
  logger.info(`🌍 Environment: ${env.NODE_ENV}`);
  logger.info(`📡 URL: http://${env.HOST}:${env.PORT}`);
  logger.info(`🩺 Health Check: http://${env.HOST}:${env.PORT}/health`);
  logger.info(`=======================================================`);

  // Inisialisasi WhatsApp Baileys
  try {
    await initWhatsAppConnection();
  } catch (err: any) {
    logger.error({ err: err.message }, 'Gagal memulai koneksi WhatsApp Baileys saat startup');
  }
});

// Graceful Shutdown
const shutdown = async (signal: string) => {
  logger.info(`Menerima sinyal ${signal}. Menjalankan graceful shutdown...`);

  server.close(async () => {
    logger.info('HTTP Server ditutup.');
    await closeDatabasePool();
    logger.info('Seluruh layanan berhasil dimatikan dengan aman. Keluar.');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Shutdown melebihi batas waktu 10 detik! Memaksa berhenti.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
