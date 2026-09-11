export function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

const MAX_CONCURRENT = Math.max(
  1,
  Number.parseInt(process.env.OPENAI_MAX_CONCURRENT ?? "1", 10) || 1,
);
const MAX_RETRIES = 5;

let inflight = 0;
const waiters: (() => void)[] = [];

function acquire() {
  if (inflight < MAX_CONCURRENT) {
    inflight++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    waiters.push(() => {
      inflight++;
      resolve();
    });
  });
}

function release() {
  inflight--;
  waiters.shift()?.();
}

function retryDelayMs(response: Response, attempt: number) {
  const header = response.headers.get("retry-after");
  const seconds = header ? Number(header) : Number.NaN;
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(60_000, seconds * 1000);
  }
  return Math.min(32_000, 1000 * 2 ** attempt);
}

async function openaiFetch(body: unknown) {
  const apiKey = requireEnv("OPENAI_API_KEY");
  await acquire();
  try {
    for (let attempt = 0; ; attempt++) {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (response.status !== 429 || attempt >= MAX_RETRIES) return response;
      const delay = retryDelayMs(response, attempt);
      await response.arrayBuffer();
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  } finally {
    release();
  }
}

function stripFence(raw: string) {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json|markdown)?\s*([\s\S]*?)\s*```$/i);
  return (fenced?.[1] ?? trimmed).trim();
}

export async function openaiJson(system: string, user: string) {
  const model =
    process.env.OPENAI_SUMMARY_MODEL?.trim() ||
    process.env.OPENAI_JUDGE_MODEL?.trim() ||
    "gpt-4.1";

  const response = await openaiFetch({
    model,
    max_completion_tokens: 2500,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI ${response.status}: ${raw.slice(0, 400)}`);
  }

  const payload = JSON.parse(raw) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("OpenAI returned an empty summary");
  return stripFence(content);
}
