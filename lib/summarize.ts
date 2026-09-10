import { openaiJson } from "@/lib/openai";

const SONIOX_SUMMARY_PROMPT = `You write meeting summaries from a transcript labeled Soniox transcription.

Rules:
- Use only facts in the transcript. Do not invent owners, dates, numbers, or decisions.
- Prefer short sections: Overview, Decisions, Action items, Risks, Next steps.
- If a field is unclear, say it is unclear. Do not guess.
- Keep names and numbers exactly as spoken.`;

const GRANOLA_PROMPT = `Write Granola-style meeting notes from this transcript.

Granola style:
- Reads like notes a person took in the room, not a corporate recap.
- Short bullets. Plain language.
- Structure:
  ## Overview
  ## Key decisions
  ## Action items
  ## Open questions
  ## Notable quotes
- Action items: task, owner if named, due date if named. Never invent an owner or date.
- Quotes: short, only if they appeared. Attribute the speaker when labeled.
- Skip filler, greetings, and repeated agreement.
- Do not add facts that are not in the transcript.`;

export async function summarizeSoniox(transcript: string) {
  const provided = process.env.SUMMARIZE_API_URL?.trim();
  if (provided) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const key = process.env.SUMMARIZE_API_KEY?.trim();
    if (key) headers.Authorization = `Bearer ${key}`;

    const res = await fetch(provided, {
      method: "POST",
      headers,
      body: JSON.stringify({ transcript, source: "soniox" }),
    });
    const raw = await res.text();
    if (!res.ok) {
      throw new Error(`Summarize API ${res.status}: ${raw.slice(0, 400)}`);
    }
    const payload = JSON.parse(raw) as { summary?: string };
    if (!payload.summary?.trim()) {
      throw new Error("Summarize API did not return a summary");
    }
    return payload.summary.trim();
  }

  return openaiJson(
    SONIOX_SUMMARY_PROMPT,
    `Soniox transcription:\n\n${transcript}`,
  );
}

export async function summarizeGranola(transcript: string) {
  return openaiJson(
    GRANOLA_PROMPT,
    `Deepgram transcription:\n\n${transcript}`,
  );
}
