import { HttpError, jsonError } from "@/lib/http";
import { summarizeSoniox } from "@/lib/summarize";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      transcript?: string;
      source?: string;
    };
    const transcript = body.transcript?.trim();
    if (!transcript) {
      throw new HttpError(400, "JSON body must include `transcript`.");
    }
    const source = body.source?.trim() || "soniox";
    const summary = await summarizeSoniox(transcript, source);
    return Response.json({ summary });
  } catch (error) {
    return jsonError(error);
  }
}
