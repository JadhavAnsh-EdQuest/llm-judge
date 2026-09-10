import { jsonError, readAudioFile } from "@/lib/audio";
import { transcribeSoniox } from "@/lib/soniox";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const audio = await readAudioFile(request);
    const transcript = await transcribeSoniox(audio.bytes, audio.filename);
    return Response.json({
      label: "Soniox transcription",
      transcript,
    });
  } catch (error) {
    return jsonError(error);
  }
}
