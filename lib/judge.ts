import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { JudgeReport } from "@/lib/types";

const JUDGE_SCRIPT = path.resolve(
  process.cwd(),
  process.env.JUDGE_SCRIPT_PATH?.trim() || "../llm-judge-summary.js",
);

async function assertJudgeScript() {
  try {
    await access(JUDGE_SCRIPT);
  } catch {
    throw new Error(
      `Judge script not found at ${JUDGE_SCRIPT}. Set JUDGE_SCRIPT_PATH if it lives elsewhere.`,
    );
  }
}

function runJudgeScript(args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, [JUDGE_SCRIPT, ...args], {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            stderr.trim() || stdout.trim() || `Judge script exited with ${code}`,
          ),
        );
        return;
      }
      resolve(stdout);
    });
  });
}

export async function runJudge(input: {
  sonioxTranscript: string;
  sonioxSummary: string;
  deepgramTranscript: string;
  deepgramSummary: string;
}) {
  await assertJudgeScript();
  const dir = await mkdtemp(path.join(tmpdir(), "llm-judge-"));
  const outPath = path.join(dir, "report.json");

  try {
    const sonioxTranscriptPath = path.join(dir, "soniox-transcript.txt");
    const sonioxSummaryPath = path.join(dir, "soniox-summary.txt");
    const deepgramTranscriptPath = path.join(dir, "deepgram-transcript.txt");
    const deepgramSummaryPath = path.join(dir, "deepgram-summary.txt");

    await Promise.all([
      writeFile(sonioxTranscriptPath, input.sonioxTranscript, "utf8"),
      writeFile(sonioxSummaryPath, input.sonioxSummary, "utf8"),
      writeFile(deepgramTranscriptPath, input.deepgramTranscript, "utf8"),
      writeFile(deepgramSummaryPath, input.deepgramSummary, "utf8"),
    ]);

    await runJudgeScript([
      "compare",
      "--soniox-transcript",
      sonioxTranscriptPath,
      "--soniox-summary",
      sonioxSummaryPath,
      "--deepgram-transcript",
      deepgramTranscriptPath,
      "--deepgram-summary",
      deepgramSummaryPath,
      "--out",
      outPath,
    ]);

    const raw = await readFile(outPath, "utf8");
    return JSON.parse(raw) as JudgeReport;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
