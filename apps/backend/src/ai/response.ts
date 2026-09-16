import type { ParsedAIResponse } from './types';

const JSON_KEYS = ['answer', 'response', 'content', 'text', 'message'];

export function stripCodeFence(raw: string): string {
  return raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .replace(/\r/g, '')
    .trim();
}

export function sanitizeAIText(raw: string): string {
  return raw
    .replace(/\u0000/g, '')
    .replace(/\s+\n+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 4000);
}

function findNestedString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() !== '') {
    return value;
  }

  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    for (const key of JSON_KEYS) {
      const found = rec[key];
      if (typeof found === 'string' && found.trim() !== '') {
        return found;
      }
    }

    for (const key of ['data', 'result', 'output']) {
      const found = rec[key];
      if (found && typeof found === 'object') {
        const nested = findNestedString(found);
        if (nested) {
          return nested;
        }
      }
    }
  }

  return null;
}

export function parseAIResponse(raw: unknown): ParsedAIResponse {
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw ?? '');
  const trimmed = stripCodeFence(text);

  if (!trimmed) {
    throw new Error('AI response kosong setelah sanitasi.');
  }

  try {
    const parsed = JSON.parse(trimmed);
    const answer = findNestedString(parsed);
    if (answer) {
      return {
        answer: sanitizeAIText(answer),
        source: 'json',
        confidence: 0.9,
      };
    }
  } catch {
    // fallback to plain text below
  }

  return {
    answer: sanitizeAIText(trimmed),
    source: 'text',
    confidence: 0.7,
  };
}

export function summarizeAIError(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';

  if (/timeout|timed out|aborted|AbortError/i.test(message)) {
    return 'Request ke Ollama timeout.';
  }

  if (/fetch|ECONNREFUSED|ECONNRESET|ENOTFOUND|network/i.test(message)) {
    return 'Jaringan ke Ollama tidak tersedia.';
  }

  if (/HTTP\s*[45]\d\d|status.*(400|401|404|500)/i.test(message)) {
    return 'Respons server Ollama menolak permintaan.';
  }

  return message.slice(0, 200);
}
