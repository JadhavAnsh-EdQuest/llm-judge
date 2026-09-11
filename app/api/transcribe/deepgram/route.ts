import { readAudioFile } from "@/lib/audio";
import { jsonError } from "@/lib/http";
import { transcribeDeepgram } from "@/lib/deepgram";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const audio = await readAudioFile(request);
    const transcript = await transcribeDeepgram(audio.bytes, audio.type);
    return Response.json({
      label: "Deepgram transcription",
      transcript,
    });
  } catch (error) {
    return jsonError(error);
  }
}
