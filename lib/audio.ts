import { HttpError } from "@/lib/http";

export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/webm",
  "audio/ogg",
  "audio/flac",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "video/mp4",
  "video/webm",
  "application/octet-stream",
]);

const ALLOWED_EXT = /\.(mp3|wav|m4a|ogg|flac|webm|mp4|mpeg)$/i;

export async function readAudioFile(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new HttpError(400, "Upload an audio file as form field `file`.");
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new HttpError(400, "Upload an audio file as form field `file`.");
  }
  if (file.size > MAX_AUDIO_BYTES) {
    throw new HttpError(413, "Audio file must be 25MB or smaller.");
  }
  const type = file.type || "application/octet-stream";
  if (!ALLOWED_TYPES.has(type) && !ALLOWED_EXT.test(file.name)) {
    throw new HttpError(415, "Unsupported audio type.");
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  return { file, bytes, filename: file.name || "audio", type };
}
