const DEFAULT_HUIT_BASE =
  "https://go.apis.huit.harvard.edu/ais-openai-direct/v1";
const DIRECT_OPENAI_BASE = "https://api.openai.com/v1";

type RequestKind = "json" | "form-data";

function normalizePath(path: string): string {
  if (path.startsWith("/")) return path;
  return `/${path}`;
}

function resolveConfig(kind: RequestKind): {
  baseUrl: string;
  headers: HeadersInit;
} {
  const huitApiKey = process.env.HUIT_OPENAI_API_KEY;
  const huitBase =
    process.env.HUIT_OPENAI_BASE_URL?.replace(/\/+$/, "") ||
    DEFAULT_HUIT_BASE;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (huitApiKey) {
    const headers: HeadersInit =
      kind === "json"
        ? { "Content-Type": "application/json", "api-key": huitApiKey }
        : { "api-key": huitApiKey };

    return {
      baseUrl: huitBase,
      headers,
    };
  }

  if (openaiApiKey) {
    const headers: HeadersInit =
      kind === "json"
        ? {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openaiApiKey}`,
          }
        : { Authorization: `Bearer ${openaiApiKey}` };

    return {
      baseUrl: DIRECT_OPENAI_BASE,
      headers,
    };
  }

  throw new Error(
    "No OpenAI credentials configured. Set HUIT_OPENAI_API_KEY or OPENAI_API_KEY."
  );
}

export async function callChatCompletion(
  body: unknown,
  endpoint = "/chat/completions",
  init: Partial<RequestInit> = {}
): Promise<Response> {
  const { baseUrl, headers } = resolveConfig("json");

  return fetch(`${baseUrl}${normalizePath(endpoint)}`, {
    method: "POST",
    headers: {
      ...headers,
      ...(init.headers || {}),
    },
    body: JSON.stringify(body),
    ...init,
  });
}

export async function callAudioTranscription(
  formData: FormData,
  endpoint = "/audio/transcriptions",
  init: Partial<RequestInit> = {}
): Promise<Response> {
  const { baseUrl, headers } = resolveConfig("form-data");

  return fetch(`${baseUrl}${normalizePath(endpoint)}`, {
    method: "POST",
    headers: {
      ...headers,
      ...(init.headers || {}),
    },
    body: formData,
    ...init,
  });
}
