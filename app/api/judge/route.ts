import { HttpError, jsonError } from "@/lib/http";
import { runJudge } from "@/lib/judge";
import type { PipelinePair } from "@/lib/types";

export const maxDuration = 180;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      soniox?: PipelinePair;
      deepgram?: PipelinePair;
    };
    const sonioxTranscript = body.soniox?.transcript?.trim();
    const sonioxSummary = body.soniox?.summary?.trim();
    const deepgramTranscript = body.deepgram?.transcript?.trim();
    const deepgramSummary = body.deepgram?.summary?.trim();
    if (
      !sonioxTranscript ||
      !sonioxSummary ||
      !deepgramTranscript ||
      !deepgramSummary
    ) {
      throw new HttpError(
        400,
        "JSON body must include soniox and deepgram transcript + summary.",
      );
    }

    const report = await runJudge({
      sonioxTranscript,
      sonioxSummary,
      deepgramTranscript,
      deepgramSummary,
    });
    return Response.json(report);
  } catch (error) {
    return jsonError(error);
  }
}
