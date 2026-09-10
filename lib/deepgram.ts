import { requireEnv } from "@/lib/openai";

type DeepgramUtterance = {
  speaker?: number;
  transcript?: string;
};

export async function transcribeDeepgram(
  bytes: Buffer,
  contentType: string,
) {
  const params = new URLSearchParams({
    model: "nova-3",
    smart_format: "true",
    diarize: "true",
    punctuate: "true",
    paragraphs: "true",
    utterances: "true",
    detect_language: "true",
  });

  const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${requireEnv("DEEPGRAM_API_KEY")}`,
      "Content-Type": contentType || "application/octet-stream",
    },
    body: new Uint8Array(bytes),
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Deepgram ${res.status}: ${raw.slice(0, 400)}`);
  }

  const payload = JSON.parse(raw) as {
    results?: {
      utterances?: DeepgramUtterance[];
      channels?: { alternatives?: { transcript?: string }[] }[];
    };
  };

  const utterances = payload.results?.utterances ?? [];
  if (utterances.length > 0) {
    return utterances
      .map((u) => {
        const speaker =
          u.speaker === undefined ? "Unknown" : String(u.speaker);
        return `Speaker ${speaker}: ${u.transcript ?? ""}`.trim();
      })
      .join("\n\n")
      .trim();
  }

  const text =
    payload.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? "";
  if (!text) throw new Error("Deepgram returned an empty transcript");
  return text;
}
