import { openaiJudgeJson } from "@/lib/openai";
import type { ComparisonReport, JudgeReport, PipelineJudgement } from "@/lib/types";

const JUDGE_PROMPT = `You are an expert meeting-notes judge. Score how well SUMMARY captures TRANSCRIPT.

Ground every claim in the transcript. Do not give the summary the benefit of the doubt.

Score each dimension 1–5 (integers only):
- 5 excellent
- 4 good, minor issues
- 3 mixed / borderline
- 2 poor
- 1 failing

Dimensions:
1. faithfulness — every summary claim is supported by the transcript; no invented facts, numbers, owners, dates, or decisions
2. completeness — important decisions, action items, owners, deadlines, and risks that were stated are present
3. action_items — owners and due dates match the transcript; no fabricated tasks
4. attribution — speakers / owners are correct; unnamed when the transcript is unclear
5. conciseness — useful density without padding, duplication, or dropping material facts

Verdict:
- pass: overall >= 4 and faithfulness >= 4
- borderline: overall == 3 or faithfulness == 3
- fail: otherwise

Return ONLY valid JSON (no markdown, no extra keys):
{
  "verdict": "pass" | "borderline" | "fail",
  "overallScore": 1,
  "dimensions": {
    "faithfulness": { "score": 1, "rationale": "" },
    "completeness": { "score": 1, "rationale": "" },
    "action_items": { "score": 1, "rationale": "" },
    "attribution": { "score": 1, "rationale": "" },
    "conciseness": { "score": 1, "rationale": "" }
  },
  "hallucinations": [{ "claim": "", "why": "" }],
  "omissions": [{ "fact": "", "whyItMatters": "" }],
  "notes": ""
}

Use empty arrays when there are no hallucinations or omissions.
overallScore is the integer average of the five dimension scores, rounded to nearest (0.5 rounds up).`;

const COMPARE_PROMPT = `You are comparing two meeting-notes pipelines on the SAME audio.

Pipeline A is Soniox transcription + provided summarization API.
Pipeline B is Deepgram transcription + Granola-style meeting summary.

You are given:
- both transcripts
- both summaries
- per-pipeline judge scores (JSON)

Decide which service was good or bad. Separate transcription quality from summarization quality when you can infer it (coverage, speaker labels, dropped names/numbers). Ground missed points in the transcripts.

Return ONLY valid JSON:
{
  "winner": "soniox" | "deepgram" | "tie",
  "transcriptionWinner": "soniox" | "deepgram" | "tie",
  "summarizationWinner": "soniox" | "deepgram" | "tie",
  "whichWasGood": "",
  "whichWasBad": "",
  "missedPoints": {
    "soniox": [{ "fact": "", "whyItMatters": "" }],
    "deepgram": [{ "fact": "", "whyItMatters": "" }]
  },
  "notes": ""
}

whichWasGood / whichWasBad should name the service and say why in 1–3 sentences.
Use empty arrays when nothing material was missed.`;

type PairScore = Omit<PipelineJudgement, "label">;

async function judgePair(transcript: string, summary: string) {
  return openaiJudgeJson<PairScore>(
    JUDGE_PROMPT,
    `TRANSCRIPT:\n${transcript}\n\nSUMMARY:\n${summary}`,
  );
}

export async function runJudge(input: {
  sonioxTranscript: string;
  sonioxSummary: string;
  deepgramTranscript: string;
  deepgramSummary: string;
}) {
  const [soniox, deepgram] = await Promise.all([
    judgePair(input.sonioxTranscript, input.sonioxSummary),
    judgePair(input.deepgramTranscript, input.deepgramSummary),
  ]);

  const comparison = await openaiJudgeJson<ComparisonReport>(
    COMPARE_PROMPT,
    [
      `SONIOX TRANSCRIPT:\n${input.sonioxTranscript}`,
      `SONIOX SUMMARY:\n${input.sonioxSummary}`,
      `SONIOX JUDGE:\n${JSON.stringify(soniox)}`,
      `DEEPGRAM TRANSCRIPT:\n${input.deepgramTranscript}`,
      `DEEPGRAM SUMMARY:\n${input.deepgramSummary}`,
      `DEEPGRAM JUDGE:\n${JSON.stringify(deepgram)}`,
    ].join("\n\n"),
  );

  return {
    steps: [
      "Soniox transcription",
      "Deepgram transcription",
      "Soniox summarization (provided API)",
      "Deepgram summarization (Granola style)",
      "Per-pipeline summary judge",
      "Head-to-head comparison",
    ],
    soniox: { label: "Soniox transcription", ...soniox },
    deepgram: { label: "Deepgram transcription", ...deepgram },
    comparison,
  } satisfies JudgeReport;
}
