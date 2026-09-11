export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function jsonError(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "Unexpected error";
  return Response.json({ error: message }, { status: 500 });
}

export async function requireTranscript(request: Request) {
  const body = (await request.json()) as { transcript?: string };
  const transcript = body.transcript?.trim();
  if (!transcript) {
    throw new HttpError(400, "JSON body must include `transcript`.");
  }
  return transcript;
}
