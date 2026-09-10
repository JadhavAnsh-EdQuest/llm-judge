import { requireEnv } from "@/lib/openai";

const BASE = "https://api.soniox.com";

type SonioxToken = {
  text: string;
  speaker?: string | number;
  language?: string;
};

async function soniox(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${requireEnv("SONIOX_API_KEY")}`,
      ...init.headers,
    },
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Soniox ${res.status}: ${raw.slice(0, 400)}`);
  }
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

function renderTokens(tokens: SonioxToken[]) {
  const parts: string[] = [];
  let currentSpeaker: string | undefined;
  for (const token of tokens) {
    const speaker =
      token.speaker === undefined ? undefined : String(token.speaker);
    if (speaker !== undefined && speaker !== currentSpeaker) {
      if (currentSpeaker !== undefined) parts.push("\n\n");
      currentSpeaker = speaker;
      parts.push(`Speaker ${currentSpeaker}:`);
      parts.push(token.text.replace(/^\s*/, " "));
      continue;
    }
    parts.push(token.text);
  }
  return parts.join("").trim();
}

export async function transcribeSoniox(bytes: Buffer, filename: string) {
  const form = new FormData();
  form.append(
    "file",
    new File([new Uint8Array(bytes)], filename, {
      type: "application/octet-stream",
    }),
  );

  const uploaded = await soniox("/v1/files", { method: "POST", body: form });
  const fileId = String(uploaded.id);
  let transcriptionId = "";

  try {
    const created = await soniox("/v1/transcriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "stt-async-v5",
        file_id: fileId,
        language_hints: ["en"],
        enable_speaker_diarization: true,
      }),
    });
    transcriptionId = String(created.id);

    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      const status = await soniox(`/v1/transcriptions/${transcriptionId}`);
      if (status.status === "completed") break;
      if (status.status === "error") {
        throw new Error(String(status.error_message || "Soniox transcription failed"));
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    const transcript = await soniox(
      `/v1/transcriptions/${transcriptionId}/transcript`,
    );
    const tokens = (transcript.tokens as SonioxToken[] | undefined) ?? [];
    const text =
      typeof transcript.text === "string" && transcript.text.trim()
        ? transcript.text.trim()
        : renderTokens(tokens);
    if (!text) throw new Error("Soniox returned an empty transcript");
    return text;
  } finally {
    if (transcriptionId) {
      await soniox(`/v1/transcriptions/${transcriptionId}`, {
        method: "DELETE",
      }).catch(() => undefined);
    }
    await soniox(`/v1/files/${fileId}`, { method: "DELETE" }).catch(
      () => undefined,
    );
  }
}
