import { HttpError, jsonError } from "@/lib/audio";
import { summarizeGranola } from "@/lib/summarize";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { transcript?: string };
    const transcript = body.transcript?.trim();
    if (!transcript) {
      throw new HttpError(400, "JSON body must include `transcript`.");
    }
    const summary = await summarizeGranola(transcript);
    return Response.json({ summary });
  } catch (error) {
    return jsonError(error);
  }
}
