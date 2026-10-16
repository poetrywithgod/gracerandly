/**
 * Thin client for Google's Gemini API (free tier friendly), used by every AI
 * feature in the API (lib/ai.ts today; translation, price hints and the
 * support assistant later). Plain `fetch` — no SDK to keep up to date.
 *
 * Free-tier things worth knowing (https://ai.google.dev/gemini-api/terms):
 *  - Rate limits are per Google project, not per key, and differ per model;
 *    check your own in AI Studio. When they're hit Google answers 429 and
 *    this client turns that into a friendly "try again" error.
 *  - On the unpaid tier Google may use what you send, and the replies, to
 *    improve its products, and human reviewers may read it. So only send
 *    text you're comfortable with that (shopping lists are fine; don't send
 *    phone numbers, addresses, or anything private). Switching the project
 *    to paid billing turns that off — no code change needed.
 *
 * The model name is configurable (GEMINI_MODEL) because Google retires and
 * renames models regularly; the default is a small, fast, free-tier model.
 */
import { AppErrors } from "./errors";

const DEFAULT_MODEL = "gemini-2.5-flash-lite";
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const REQUEST_TIMEOUT_MS = 20_000;
const RETRYABLE_STATUSES = new Set([500, 503]);

export interface GeminiJsonRequest {
  system: string;
  prompt: string;
  /** Gemini "responseSchema" (OpenAPI subset) describing the JSON to return. */
  schema: Record<string, unknown>;
  temperature?: number;
  maxOutputTokens?: number;
}

function getApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Get a free key at https://aistudio.google.com/apikey and add it to apps/api/.env."
    );
  }
  return apiKey;
}

async function callOnce(body: unknown): Promise<Response> {
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  return fetch(`${BASE_URL}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": getApiKey() },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

/**
 * Asks Gemini for JSON matching `schema` and returns it parsed (still
 * untrusted — callers validate it with zod, same as any other input).
 */
export async function geminiJson(request: GeminiJsonRequest): Promise<unknown> {
  const body = {
    systemInstruction: { parts: [{ text: request.system }] },
    contents: [{ role: "user", parts: [{ text: request.prompt }] }],
    generationConfig: {
      temperature: request.temperature ?? 0,
      maxOutputTokens: request.maxOutputTokens ?? 1024,
      responseMimeType: "application/json",
      responseSchema: request.schema,
    },
  };

  let response: Response;
  try {
    response = await callOnce(body);
    if (RETRYABLE_STATUSES.has(response.status)) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      response = await callOnce(body);
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("GEMINI_API_KEY")) throw err;
    throw AppErrors.deliveryFailed("The AI helper didn't respond in time — try again, or fill the form in by hand");
  }

  if (response.status === 429) {
    throw AppErrors.tooManyRequests("The AI helper is busy right now — wait a minute and try again, or fill the form in by hand");
  }
  if (!response.ok) {
    console.error("[gemini] request failed", response.status, (await response.text().catch(() => "")).slice(0, 300));
    throw AppErrors.deliveryFailed("The AI helper isn't available right now — fill the form in by hand");
  }

  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");
  if (!text) {
    throw AppErrors.deliveryFailed("The AI helper didn't return anything usable — try rephrasing");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw AppErrors.deliveryFailed("The AI helper's answer couldn't be read — try again");
  }
}
