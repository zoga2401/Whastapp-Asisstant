import { env } from '../config/env';
import { logger } from '../utils/logger';
import { buildAIConversationBundle, evaluateAIRequestDecision } from './context';
import { buildPromptFromContext } from './prompt';
import { parseAIResponse, summarizeAIError } from './response';
import type { AIHealthReport, AIProcessResult } from './types';
import { evaluateRoutingDecision } from './router';
import { generateResponse } from './responseGenerator';
import { fallbackResponse } from './fallback';

const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_MAX_RETRIES = 2;

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

export async function checkOllamaHealth(): Promise<AIHealthReport> {
  const baseUrl = normalizeBaseUrl(env.OLLAMA_BASE_URL);
  const timeoutMs = Number(env.AI_REQUEST_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const maxRetries = Number(env.AI_MAX_RETRIES ?? DEFAULT_MAX_RETRIES);
  const temperature = Number(env.AI_TEMPERATURE ?? 0.3);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 5000));

  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      return {
        ok: false,
        baseUrl,
        model: env.OLLAMA_MODEL,
        timeoutMs,
        retries: maxRetries,
        temperature,
        status: 'unavailable',
        message: `Ollama health check gagal dengan status ${response.status}.`,
      };
    }

    return {
      ok: true,
      baseUrl,
      model: env.OLLAMA_MODEL,
      timeoutMs,
      retries: maxRetries,
      temperature,
      status: 'ready',
      message: 'Ollama terdeteksi dan siap menerima request.',
    };
  } catch (error) {
    return {
      ok: false,
      baseUrl,
      model: env.OLLAMA_MODEL,
      timeoutMs,
      retries: maxRetries,
      temperature,
      status: 'unavailable',
      message: summarizeAIError(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function requestOllamaCompletion(prompt: string): Promise<string> {
  const timeoutMs = Number(env.AI_REQUEST_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const maxRetries = Number(env.AI_MAX_RETRIES ?? DEFAULT_MAX_RETRIES);
  const temperature = Number(env.AI_TEMPERATURE ?? 0.3);
  const baseUrl = normalizeBaseUrl(env.OLLAMA_BASE_URL);

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          model: env.OLLAMA_MODEL,
          prompt,
          stream: false,
          options: {
            temperature,
          },
        }),
        signal: controller.signal,
      });

      const rawText = await response.text();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${rawText.slice(0, 300)}`);
      }

      const payload = JSON.parse(rawText || '{}');
      const content = payload?.response ?? payload?.content ?? payload?.message?.content ?? payload?.answer ?? '';

      if (!content || typeof content !== 'string' || content.trim() === '') {
        throw new Error('Ollama mengembalikan respons kosong.');
      }

      return content;
    } catch (error) {
      const summary = summarizeAIError(error);
      logger.warn(
        {
          attempt: attempt + 1,
          maxRetries,
          timeoutMs,
          summary,
        },
        'Ollama request gagal; akan retry jika masih tersedia.'
      );

      if (attempt >= maxRetries) {
        throw new Error(summary);
      }

      const delayMs = 250 * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error('Request ke Ollama gagal tanpa respons valid.');
}

export async function processAIRequest(conversationId: string, userMessage: string): Promise<AIProcessResult> {
  const trimmedMessage = String(userMessage ?? '').trim();
  if (!trimmedMessage) {
    return {
      success: false,
      allowed: false,
      status: 'blocked',
      message: 'Pesan user kosong atau tidak valid.',
      conversationId,
      mode: 'OFF',
      provider: 'ollama',
      decision: {
        allowed: false,
        reason: 'Pesan user tidak boleh kosong.',
        mode: 'OFF',
        status: 'UNKNOWN',
        isPaused: false,
        aiEnabled: false,
      },
    };
  }

  const bundle = await buildAIConversationBundle(conversationId, trimmedMessage);
  const routing = bundle.routing ?? evaluateRoutingDecision(trimmedMessage, bundle.rawContext);
  const decision = evaluateAIRequestDecision(bundle.rawContext);
  const preDecision = generateResponse(bundle, undefined, { aiAvailable: true });

  if (!decision.allowed || !preDecision.decision.allowOllama) {
    return {
      success: false,
      allowed: false,
      status: preDecision.decision.action === 'WAIT' ? 'paused' : 'blocked',
      message: preDecision.decision.reason,
      conversationId,
      mode: decision.mode,
      provider: 'ollama',
      decision,
      routing,
      draftOnly: true,
      answer: preDecision.answer,
      responseAction: preDecision.decision.action,
      validation: preDecision.validation,
    };
  }

  const health = await checkOllamaHealth();
  if (!health.ok) {
    return {
      success: false,
      allowed: false,
      status: 'unavailable',
      message: health.message,
      conversationId,
      mode: decision.mode,
      provider: 'ollama',
      decision,
      routing,
      draftOnly: true,
      health,
      answer: fallbackResponse('WAIT', health.message),
      responseAction: 'WAIT',
    };
  }

  try {
    const payLoadPrompt = buildPromptFromContext(bundle);
    const rawResponse = await requestOllamaCompletion(payLoadPrompt);
    const parsed = parseAIResponse(rawResponse);
    const generated = generateResponse({ ...bundle, routing }, parsed.answer, { aiAvailable: true });

    logger.info(
      {
        conversationId,
        model: env.OLLAMA_MODEL,
        mode: decision.mode,
        answerLength: parsed.answer.length,
      },
      'AI completion siap dipakai.'
    );

    return {
      success: true,
      allowed: true,
      status: 'ok',
      message: 'AI berhasil menghasilkan jawaban lokal menggunakan Ollama.',
      conversationId,
      mode: decision.mode,
      provider: 'ollama',
      answer: generated.answer,
      decision,
      routing,
      draftOnly: true,
      health,
      responseAction: generated.decision.action,
      validation: generated.validation,
    };
  } catch (error) {
    const summary = summarizeAIError(error);
    logger.error({ conversationId, summary }, 'AI request gagal setelah retry terbatas.');
    return {
      success: false,
      allowed: false,
      status: 'error',
      message: summary,
      conversationId,
      mode: decision.mode,
      provider: 'ollama',
      decision,
      routing,
      draftOnly: true,
      health,
      answer: fallbackResponse('WAIT', summary),
      responseAction: 'WAIT',
    };
  }
}
