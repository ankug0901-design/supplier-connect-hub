import { createOpenAI } from "npm:@ai-sdk/openai";

// Maps legacy Lovable AI Gateway model strings (e.g. "google/gemini-2.5-flash")
// to OpenAI model equivalents so callers don't need to change their model names.
const MODEL_MAP: Record<string, string> = {
  "google/gemini-3-flash-preview": "gpt-4o-mini",
  "google/gemini-2.5-flash": "gpt-4o-mini",
  "google/gemini-2.5-flash-lite": "gpt-4o-mini",
  "google/gemini-2.5-pro": "gpt-4o",
};

function resolveModelName(model: string): string {
  if (MODEL_MAP[model]) return MODEL_MAP[model];
  // Strip provider prefix if present (e.g. "openai/gpt-4o" -> "gpt-4o")
  if (model.includes("/")) return model.split("/").pop()!;
  return model;
}

/**
 * Returns an OpenAI provider configured with OPENAI_API_KEY.
 * Accepts both OpenAI model names (e.g. "gpt-4o-mini") and legacy
 * Lovable AI Gateway model strings (e.g. "google/gemini-2.5-flash"),
 * which are automatically mapped to an OpenAI equivalent.
 *
 * NOTE: The `apiKey` argument is kept for backwards compatibility with
 * existing callers (which pass LOVABLE_API_KEY) but is ignored — the
 * OpenAI key is read from OPENAI_API_KEY.
 */
export const createLovableAiGatewayProvider = (_legacyKey?: string) => {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  const provider = createOpenAI({ apiKey: openaiKey, compatibility: "strict" });
  return (model: string) => provider(resolveModelName(model));
};
