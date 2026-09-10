# LLM Judge — Implementation Plan

Dashboard that A/B tests Soniox vs Deepgram on one uploaded audio file: transcribe both, summarize each differently, then score and compare with the existing Lungoor-Notes judge script.

## Assumptions

1. **“Provided API” for Soniox summarization** is this app’s `POST /api/summarize`. It uses OpenAI by default. If `SUMMARIZE_API_URL` is set, that URL is called instead (`POST` JSON `{ transcript, source: "soniox" }`, expect `{ summary }`).
2. **Granola style** for Deepgram means a human meeting-notes layout: overview, decisions, action items with owners/dates, open questions, short quotes. Facts only from the transcript.
3. **Judge script path** is `../llm-judge-summary.js` (Lungoor-Notes, sibling of this repo). The dashboard calls it; it is not copied into git.
4. There is **no gold transcript**. Each summary is judged against its own transcript, then the two pipelines are compared head-to-head.
5. API keys live in `.env.local`: `SONIOX_API_KEY`, `DEEPGRAM_API_KEY`, `OPENAI_API_KEY`. Optional: `SUMMARIZE_API_URL`, `OPENAI_JUDGE_MODEL`, `OPENAI_SUMMARY_MODEL`.
6. Audio cap is **25MB**. Formats: wav, mp3, m4a, ogg, flac, webm, mp4.



## Pipeline

```
audio upload
    ├─ POST /api/transcribe/soniox  → labeled “Soniox transcription”
    │       └─ POST /api/summarize
    └─ POST /api/transcribe/deepgram
            └─ POST /api/summarize/granola
                    └─ POST /api/judge  → spawn ../llm-judge-summary.js compare
```

Transcription calls run in parallel. Summaries wait on their transcript. Judge waits on both summaries.

## API contracts


| Route                           | Body                                                                     | Response                |
| ------------------------------- | ------------------------------------------------------------------------ | ----------------------- |
| `POST /api/transcribe/soniox`   | `multipart file`                                                         | `{ label, transcript }` |
| `POST /api/transcribe/deepgram` | `multipart file`                                                         | `{ label, transcript }` |
| `POST /api/summarize`           | `{ transcript, source? }`                                                | `{ summary }`           |
| `POST /api/summarize/granola`   | `{ transcript }`                                                         | `{ summary }`           |
| `POST /api/judge`               | `{ soniox: { transcript, summary }, deepgram: { transcript, summary } }` | judge JSON report       |




## Judge report

The compare CLI returns:

- `steps` — what ran
- `soniox` / `deepgram` — per-pipeline scores (faithfulness, completeness, action items, attribution, conciseness, verdict)
- `comparison.winner` — `soniox`  `deepgram`  `tie`
- `comparison.whichWasGood` / `whichWasBad`
- `comparison.missedPoints` — facts dropped by each summary
- `comparison.transcriptionWinner` / `summarizationWinner`

