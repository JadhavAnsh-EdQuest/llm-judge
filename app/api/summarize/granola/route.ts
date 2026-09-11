import { jsonError, requireTranscript } from "@/lib/http";
import { summarizeGranola } from "@/lib/summarize";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const transcript = await requireTranscript(request);
    const summary = await summarizeGranola(transcript);
    return Response.json({ summary });
  } catch (error) {
    return jsonError(error);
  }
}
