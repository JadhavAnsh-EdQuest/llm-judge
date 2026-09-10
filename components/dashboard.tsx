"use client";

import { useMemo, useRef, useState } from "react";
import { AudioLines, Upload } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { JudgeReport, TranscriptResult } from "@/lib/types";

type StepId =
  | "soniox"
  | "deepgram"
  | "sonioxSummary"
  | "deepgramSummary"
  | "judge";

type StepStatus = "idle" | "running" | "done" | "error";

const STEPS: { id: StepId; label: string }[] = [
  { id: "soniox", label: "Soniox transcription" },
  { id: "deepgram", label: "Deepgram transcription" },
  { id: "sonioxSummary", label: "Soniox summarization" },
  { id: "deepgramSummary", label: "Granola-style summary" },
  { id: "judge", label: "LLM judge report" },
];

async function readError(res: Response) {
  const text = await res.text();
  try {
    const json = JSON.parse(text) as { error?: string };
    return json.error || text.slice(0, 240) || res.statusText;
  } catch {
    return text.slice(0, 240) || res.statusText;
  }
}

export function Dashboard() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<Record<StepId, StepStatus>>({
    soniox: "idle",
    deepgram: "idle",
    sonioxSummary: "idle",
    deepgramSummary: "idle",
    judge: "idle",
  });
  const [soniox, setSoniox] = useState<TranscriptResult | null>(null);
  const [deepgram, setDeepgram] = useState<TranscriptResult | null>(null);
  const [sonioxSummary, setSonioxSummary] = useState("");
  const [deepgramSummary, setDeepgramSummary] = useState("");
  const [report, setReport] = useState<JudgeReport | null>(null);

  const doneCount = useMemo(
    () => STEPS.filter((s) => steps[s.id] === "done").length,
    [steps],
  );

  function mark(id: StepId, status: StepStatus) {
    setSteps((prev) => ({ ...prev, [id]: status }));
  }

  function onFile(next: File | null) {
    setFile(next);
    setError(null);
    setSoniox(null);
    setDeepgram(null);
    setSonioxSummary("");
    setDeepgramSummary("");
    setReport(null);
    setSteps({
      soniox: "idle",
      deepgram: "idle",
      sonioxSummary: "idle",
      deepgramSummary: "idle",
      judge: "idle",
    });
  }

  async function run() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      mark("soniox", "running");
      mark("deepgram", "running");
      const form = () => {
        const data = new FormData();
        data.append("file", file);
        return data;
      };

      const [sonioxRes, deepgramRes] = await Promise.all([
        fetch("/api/transcribe/soniox", { method: "POST", body: form() }),
        fetch("/api/transcribe/deepgram", { method: "POST", body: form() }),
      ]);

      if (!sonioxRes.ok) {
        mark("soniox", "error");
        throw new Error(`Soniox: ${await readError(sonioxRes)}`);
      }
      if (!deepgramRes.ok) {
        mark("deepgram", "error");
        throw new Error(`Deepgram: ${await readError(deepgramRes)}`);
      }

      const sonioxJson = (await sonioxRes.json()) as TranscriptResult;
      const deepgramJson = (await deepgramRes.json()) as TranscriptResult;
      setSoniox(sonioxJson);
      setDeepgram(deepgramJson);
      mark("soniox", "done");
      mark("deepgram", "done");

      mark("sonioxSummary", "running");
      mark("deepgramSummary", "running");
      const [sumRes, granolaRes] = await Promise.all([
        fetch("/api/summarize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript: sonioxJson.transcript,
            source: "soniox",
          }),
        }),
        fetch("/api/summarize/granola", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript: deepgramJson.transcript }),
        }),
      ]);
      if (!sumRes.ok) {
        mark("sonioxSummary", "error");
        throw new Error(`Soniox summary: ${await readError(sumRes)}`);
      }
      if (!granolaRes.ok) {
        mark("deepgramSummary", "error");
        throw new Error(`Deepgram summary: ${await readError(granolaRes)}`);
      }
      const sonioxSum = (await sumRes.json()) as { summary: string };
      const deepgramSum = (await granolaRes.json()) as { summary: string };
      setSonioxSummary(sonioxSum.summary);
      setDeepgramSummary(deepgramSum.summary);
      mark("sonioxSummary", "done");
      mark("deepgramSummary", "done");

      mark("judge", "running");
      const judgeRes = await fetch("/api/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          soniox: {
            transcript: sonioxJson.transcript,
            summary: sonioxSum.summary,
          },
          deepgram: {
            transcript: deepgramJson.transcript,
            summary: deepgramSum.summary,
          },
        }),
      });
      if (!judgeRes.ok) {
        mark("judge", "error");
        throw new Error(`Judge: ${await readError(judgeRes)}`);
      }
      setReport((await judgeRes.json()) as JudgeReport);
      mark("judge", "done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full bg-background text-foreground">
      <header className="border-b border-border px-6 py-4">
        <div className="mx-auto flex max-w-350 items-end justify-between gap-6">
          <div>
            <p className="font-mono text-[11px] tracking-[0.22em] text-muted-foreground uppercase">
              Channel bake-off
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              LLM Judge
            </h1>
          </div>
          <p className="max-w-sm text-right text-sm text-muted-foreground">
            Soniox vs Deepgram on the same recording. Summaries scored against
            their own transcripts.
          </p>
        </div>
      </header>

      <main className="mx-auto grid max-w-350 gap-6 px-6 py-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Source</CardTitle>
              <CardDescription>One audio file, two STT stacks.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  onFile(e.dataTransfer.files[0] ?? null);
                }}
                className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm hover:bg-muted/40"
              >
                <Upload className="size-4 text-muted-foreground" />
                {file ? file.name : "Drop audio or browse"}
                {file ? (
                  <span className="font-mono text-xs text-muted-foreground">
                    {(file.size / (1024 * 1024)).toFixed(1)} MB
                  </span>
                ) : null}
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="audio/*,video/mp4,video/webm,.mp3,.wav,.m4a,.ogg,.flac"
                className="sr-only"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
              <Button
                className="w-full"
                disabled={!file || busy}
                onClick={() => void run()}
              >
                {busy ? <Spinner /> : null}
                {busy ? "Running board" : "Run both channels"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Board</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Progress value={(doneCount / STEPS.length) * 100}>
                <ProgressLabel>Complete</ProgressLabel>
                <ProgressValue />
              </Progress>
              <ol className="space-y-2">
                {STEPS.map((step, i) => (
                  <li
                    key={step.id}
                    className="flex items-center justify-between gap-2 font-mono text-xs"
                  >
                    <span className="text-muted-foreground">
                      {String(i + 1).padStart(2, "0")} {step.label}
                    </span>
                    <StepPill status={steps[step.id]} />
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </aside>

        <section className="space-y-6">
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Run stopped</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-2">
            <ChannelCard
              tone="a"
              title="Soniox"
              subtitle="Transcription → provided summarizer"
              label={soniox?.label ?? "Soniox transcription"}
              transcript={soniox?.transcript}
              summary={sonioxSummary}
              empty="Waiting for Soniox"
            />
            <ChannelCard
              tone="b"
              title="Deepgram"
              subtitle="Transcription → Granola-style notes"
              label={deepgram?.label ?? "Deepgram transcription"}
              transcript={deepgram?.transcript}
              summary={deepgramSummary}
              empty="Waiting for Deepgram"
            />
          </div>

          <JudgePanel report={report} />
        </section>
      </main>
    </div>
  );
}

function StepPill({ status }: { status: StepStatus }) {
  const label =
    status === "running"
      ? "live"
      : status === "done"
        ? "ok"
        : status === "error"
          ? "err"
          : "idle";
  return (
    <Badge
      variant={
        status === "error"
          ? "destructive"
          : status === "done"
            ? "default"
            : "outline"
      }
    >
      {status === "running" ? <Spinner className="size-3" /> : null}
      {label}
    </Badge>
  );
}

function ChannelCard({
  tone,
  title,
  subtitle,
  label,
  transcript,
  summary,
  empty,
}: {
  tone: "a" | "b";
  title: string;
  subtitle: string;
  label: string;
  transcript?: string;
  summary?: string;
  empty: string;
}) {
  const ready = Boolean(transcript || summary);
  return (
    <Card className={tone === "a" ? "ring-1 ring-(--channel-a)/30" : "ring-1 ring-(--channel-b)/30"}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{title}</CardTitle>
          <Badge variant="outline">{label}</Badge>
        </div>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        {ready ? (
          <Tabs defaultValue="transcript">
            <TabsList>
              <TabsTrigger value="transcript">Transcript</TabsTrigger>
              <TabsTrigger value="summary">Summary</TabsTrigger>
            </TabsList>
            <TabsContent value="transcript">
              <ScrollArea className="mt-3 h-72 rounded-lg border border-border bg-muted/20 p-3">
                <pre className="font-mono text-xs leading-5 whitespace-pre-wrap">
                  {transcript || "—"}
                </pre>
              </ScrollArea>
            </TabsContent>
            <TabsContent value="summary">
              <ScrollArea className="mt-3 h-72 rounded-lg border border-border bg-muted/20 p-3">
                <pre className="font-mono text-xs leading-5 whitespace-pre-wrap">
                  {summary || "—"}
                </pre>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        ) : (
          <Empty className="min-h-72 border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <AudioLines />
              </EmptyMedia>
              <EmptyTitle>{empty}</EmptyTitle>
              <EmptyDescription>
                Upload audio and run the board.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  );
}

function JudgePanel({ report }: { report: JudgeReport | null }) {
  if (!report) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Judge report</CardTitle>
          <CardDescription>
            Scores, missed points, and which stack held up.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Empty className="border border-dashed py-10">
            <EmptyHeader>
              <EmptyTitle>No verdict yet</EmptyTitle>
              <EmptyDescription>
                The Lungoor-Notes judge script runs after both summaries land.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    );
  }

  const { comparison, soniox, deepgram, steps } = report;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Judge report</CardTitle>
            <CardDescription>{comparison.notes}</CardDescription>
          </div>
          <Badge className="capitalize">{comparison.winner}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2">
          <Alert>
            <AlertTitle>Good</AlertTitle>
            <AlertDescription>{comparison.whichWasGood}</AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <AlertTitle>Weak</AlertTitle>
            <AlertDescription>{comparison.whichWasBad}</AlertDescription>
          </Alert>
        </div>

        <div className="flex flex-wrap gap-2 font-mono text-xs text-muted-foreground">
          <span>STT: {comparison.transcriptionWinner}</span>
          <Separator orientation="vertical" className="h-4" />
          <span>Summary: {comparison.summarizationWinner}</span>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <ScoreCard title="Soniox" judgement={soniox} />
          <ScoreCard title="Deepgram" judgement={deepgram} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Missed title="Missed by Soniox" items={comparison.missedPoints.soniox} />
          <Missed
            title="Missed by Deepgram"
            items={comparison.missedPoints.deepgram}
          />
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">Steps involved</p>
          <ol className="grid gap-1 font-mono text-xs text-muted-foreground sm:grid-cols-2">
            {steps.map((step, i) => (
              <li key={step}>
                {String(i + 1).padStart(2, "0")} {step}
              </li>
            ))}
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}

function ScoreCard({
  title,
  judgement,
}: {
  title: string;
  judgement: JudgeReport["soniox"];
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium">{title}</p>
        <Badge variant="outline">
          {judgement.verdict} · {judgement.overallScore}/5
        </Badge>
      </div>
      <div className="space-y-2">
        {Object.entries(judgement.dimensions).map(([key, dim]) => (
          <Progress key={key} value={(dim.score / 5) * 100}>
            <ProgressLabel className="capitalize">
              {key.replace("_", " ")}
            </ProgressLabel>
            <ProgressValue>
              {() => `${dim.score}/5`}
            </ProgressValue>
          </Progress>
        ))}
      </div>
    </div>
  );
}

function Missed({
  title,
  items,
}: {
  title: string;
  items: { fact: string; whyItMatters: string }[];
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{title}</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing material missed.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {items.map((item) => (
            <li key={item.fact} className="rounded-md bg-muted/40 px-3 py-2">
              <p>{item.fact}</p>
              <p className="text-muted-foreground">{item.whyItMatters}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
