"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AudioLines, Radio, Upload } from "lucide-react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "cn";
import type { JudgeReport, TranscriptResult } from "@/lib/types";

type StepId =
  | "soniox"
  | "deepgram"
  | "sonioxSummary"
  | "deepgramSummary"
  | "judge";

type StepStatus = "idle" | "running" | "done" | "error";

const STEPS: { id: StepId; label: string; channel?: "a" | "b" }[] = [
  { id: "soniox", label: "Soniox transcription", channel: "a" },
  { id: "deepgram", label: "Deepgram transcription", channel: "b" },
  { id: "sonioxSummary", label: "Soniox summarization", channel: "a" },
  { id: "deepgramSummary", label: "Granola-style summary", channel: "b" },
  { id: "judge", label: "LLM judge report" },
];

const spring = { type: "spring" as const, stiffness: 140, damping: 22 };

async function readError(res: Response) {
  const text = await res.text();
  try {
    const json = JSON.parse(text) as { error?: string };
    return json.error || text.slice(0, 240) || res.statusText;
  } catch {
    return text.slice(0, 240) || res.statusText;
  }
}

function withViewTransition(update: () => void) {
  if (typeof document !== "undefined" && "startViewTransition" in document) {
    document.startViewTransition(update);
    return;
  }
  update();
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
  const progressPct = (doneCount / STEPS.length) * 100;

  const channelAActive =
    steps.soniox === "running" || steps.sonioxSummary === "running";
  const channelBActive =
    steps.deepgram === "running" || steps.deepgramSummary === "running";

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
    const form = () => {
      const data = new FormData();
      data.append("file", file);
      return data;
    };

    async function channel(
      transcribeId: "soniox" | "deepgram",
      transcribeUrl: string,
      summaryId: "sonioxSummary" | "deepgramSummary",
      summarize: (
        transcript: string,
      ) => Promise<{ summary: string }>,
      setTranscript: (t: TranscriptResult) => void,
      setSummary: (s: string) => void,
    ) {
      mark(transcribeId, "running");
      const transcribeRes = await fetch(transcribeUrl, {
        method: "POST",
        body: form(),
      });
      if (!transcribeRes.ok) {
        mark(transcribeId, "error");
        throw new Error(
          `${transcribeId === "soniox" ? "Soniox" : "Deepgram"}: ${await readError(transcribeRes)}`,
        );
      }
      const transcriptJson =
        (await transcribeRes.json()) as TranscriptResult;
      setTranscript(transcriptJson);
      mark(transcribeId, "done");

      mark(summaryId, "running");
      const summary = await summarize(transcriptJson.transcript);
      setSummary(summary.summary);
      mark(summaryId, "done");
      return {
        transcript: transcriptJson.transcript,
        summary: summary.summary,
      };
    }

    try {
      const [sonioxResult, deepgramResult] = await Promise.allSettled([
        channel(
          "soniox",
          "/api/transcribe/soniox",
          "sonioxSummary",
          async (transcript) => {
            const res = await fetch("/api/summarize", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ transcript, source: "soniox" }),
            });
            if (!res.ok) {
              mark("sonioxSummary", "error");
              throw new Error(`Soniox summary: ${await readError(res)}`);
            }
            return (await res.json()) as { summary: string };
          },
          setSoniox,
          setSonioxSummary,
        ),
        channel(
          "deepgram",
          "/api/transcribe/deepgram",
          "deepgramSummary",
          async (transcript) => {
            const res = await fetch("/api/summarize/granola", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ transcript }),
            });
            if (!res.ok) {
              mark("deepgramSummary", "error");
              throw new Error(`Deepgram summary: ${await readError(res)}`);
            }
            return (await res.json()) as { summary: string };
          },
          setDeepgram,
          setDeepgramSummary,
        ),
      ]);

      const errors: string[] = [];
      if (sonioxResult.status === "rejected") {
        errors.push(
          sonioxResult.reason instanceof Error
            ? sonioxResult.reason.message
            : "Soniox failed",
        );
      }
      if (deepgramResult.status === "rejected") {
        errors.push(
          deepgramResult.reason instanceof Error
            ? deepgramResult.reason.message
            : "Deepgram failed",
        );
      }
      if (errors.length) {
        setError(errors.join(" · "));
        return;
      }
      if (
        sonioxResult.status !== "fulfilled" ||
        deepgramResult.status !== "fulfilled"
      ) {
        return;
      }

      const sonioxPair = sonioxResult.value;
      const deepgramPair = deepgramResult.value;
      mark("judge", "running");
      const judgeRes = await fetch("/api/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          soniox: sonioxPair,
          deepgram: deepgramPair,
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
    <div className="broadcast-shell relative min-h-full overflow-hidden text-foreground">
      <div
        aria-hidden
        className="broadcast-scanline pointer-events-none absolute inset-x-0 top-0 h-24"
      />

      <header className="relative border-b border-border/80 bg-background/70 backdrop-blur-sm">
        <div className="mx-auto flex max-w-350 items-center justify-between gap-6 px-6 py-5">
          <div className="flex items-center gap-4">
            <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-card shadow-sm">
              <Radio className="size-4 text-primary" strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                LLM Judge
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Soniox vs Deepgram on one recording
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {busy ? <LiveIndicator /> : null}
            <p className="hidden max-w-xs text-right text-sm text-muted-foreground sm:block">
              Summaries scored against their own transcripts, then compared
              head-to-head.
            </p>
          </div>
        </div>
      </header>

      <main className="relative mx-auto grid max-w-350 gap-6 px-6 py-6 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-4">
          <Card className="border-border/80 bg-card/90 shadow-md">
            <CardHeader>
              <CardTitle>Source</CardTitle>
              <CardDescription>One audio file, two STT stacks.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <motion.button
                type="button"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  onFile(e.dataTransfer.files[0] ?? null);
                }}
                className={cn(
                  "flex w-full flex-col items-center gap-2 rounded-lg border border-dashed px-3 py-7 text-center text-sm transition-colors",
                  file
                    ? "border-primary/40 bg-primary/5"
                    : "border-border hover:bg-muted/40",
                )}
              >
                <Upload className="size-4 text-muted-foreground" />
                {file ? file.name : "Drop audio or browse"}
                {file ? (
                  <span className="font-mono text-xs text-muted-foreground">
                    {(file.size / (1024 * 1024)).toFixed(1)} MB
                  </span>
                ) : null}
              </motion.button>
              <input
                ref={inputRef}
                type="file"
                accept="audio/*,video/mp4,video/webm,.mp3,.wav,.m4a,.ogg,.flac"
                className="sr-only"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
              <Button
                className="w-full font-medium"
                disabled={!file || busy}
                onClick={() => void run()}
              >
                {busy ? <Spinner /> : null}
                {busy ? "Running board" : "Run both channels"}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-card/90 shadow-md">
            <CardHeader className="pb-2">
              <CardTitle>Pipeline board</CardTitle>
              <CardDescription>
                {busy
                  ? "Run in progress — steps update as each channel completes."
                  : doneCount === 0
                    ? "Five steps run in parallel pairs, then the judge compares both."
                    : `${doneCount} of ${STEPS.length} steps complete.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <PipelineProgress
                value={progressPct}
                doneCount={doneCount}
                total={STEPS.length}
                active={busy}
              />
              <ol className="space-y-0" aria-label="Pipeline steps">
                {STEPS.map((step, index) => (
                  <PipelineStep
                    key={step.id}
                    label={step.label}
                    status={steps[step.id]}
                    channel={step.channel}
                    isLast={index === STEPS.length - 1}
                  />
                ))}
              </ol>
            </CardContent>
          </Card>
        </aside>

        <section className="space-y-6">
          <AnimatePresence>
            {error ? (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                <Alert variant="destructive">
                  <AlertTitle>Run stopped</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <div className="grid gap-4 xl:grid-cols-2">
            <ChannelCard
              tone="a"
              title="Soniox"
              subtitle="Transcription → provided summarizer"
              label={soniox?.label ?? "Soniox transcription"}
              transcript={soniox?.transcript}
              summary={sonioxSummary}
              empty="Waiting for Soniox"
              active={channelAActive}
              hasData={Boolean(soniox?.transcript || sonioxSummary)}
            />
            <ChannelCard
              tone="b"
              title="Deepgram"
              subtitle="Transcription → Granola-style notes"
              label={deepgram?.label ?? "Deepgram transcription"}
              transcript={deepgram?.transcript}
              summary={deepgramSummary}
              empty="Waiting for Deepgram"
              active={channelBActive}
              hasData={Boolean(deepgram?.transcript || deepgramSummary)}
            />
          </div>

          <JudgePanel report={report} judging={steps.judge === "running"} />
        </section>
      </main>
    </div>
  );
}

function LiveIndicator() {
  return (
    <div className="live-indicator flex items-center gap-2 rounded-full border border-destructive/30 bg-destructive/10 px-3 py-1.5">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-destructive opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-destructive" />
      </span>
      <span className="font-mono text-[11px] font-medium tracking-[0.18em] text-destructive uppercase">
        Live
      </span>
    </div>
  );
}

function PipelineProgress({
  value,
  doneCount,
  total,
  active,
}: {
  value: number;
  doneCount: number;
  total: number;
  active: boolean;
}) {
  const reduced = useReducedMotion();
  const rounded = Math.round(value);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">
          {active ? "Running" : "Complete"}
        </span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {doneCount}/{total}
          <span aria-hidden className="mx-1.5 text-border">
            ·
          </span>
          {rounded}%
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={rounded}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${doneCount} of ${total} pipeline steps complete`}
        className="relative h-2 overflow-hidden rounded-full bg-muted"
      >
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-primary"
          initial={false}
          animate={{ width: `${value}%` }}
          transition={
            reduced
              ? { duration: 0 }
              : { type: "spring", stiffness: 90, damping: 18 }
          }
        />
        {!reduced && active && value > 0 && value < 100 ? (
          <motion.div
            className="absolute inset-y-0 w-8 bg-linear-to-r from-transparent via-primary-foreground/20 to-transparent"
            animate={{ x: ["-100%", "400%"] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
            style={{ left: `${Math.max(value - 12, 0)}%` }}
          />
        ) : null}
      </div>
    </div>
  );
}

function PipelineStep({
  label,
  status,
  channel,
  isLast,
}: {
  label: string;
  status: StepStatus;
  channel?: "a" | "b";
  isLast: boolean;
}) {
  const statusLabel =
    status === "running"
      ? "Running"
      : status === "done"
        ? "Done"
        : status === "error"
          ? "Failed"
          : "Waiting";

  return (
    <li
      aria-current={status === "running" ? "step" : undefined}
      className={cn(
        "grid grid-cols-[auto_1fr_auto] items-start gap-x-3 rounded-md px-1 py-2 text-sm transition-colors",
        status === "running" && "bg-primary/8",
        status === "error" && "bg-destructive/8",
      )}
    >
      <div className="flex flex-col items-center self-stretch pt-0.5">
        <StepLed status={status} channel={channel} />
        {!isLast ? (
          <span
            aria-hidden
            className={cn(
              "mt-1.5 w-px flex-1 min-h-4",
              status === "done" ? "bg-chart-4/35" : "bg-border/80",
            )}
          />
        ) : null}
      </div>

      <div className="min-w-0 pt-px">
        <p
          className={cn(
            "truncate leading-snug",
            status === "running" || status === "error"
              ? "font-medium text-foreground"
              : status === "done"
                ? "text-foreground/75"
                : "text-muted-foreground",
          )}
        >
          {label}
        </p>
        {channel ? (
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            Channel {channel === "a" ? "A · Soniox" : "B · Deepgram"}
          </p>
        ) : (
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Compares both pipelines
          </p>
        )}
      </div>

      <StepStatusBadge status={status} label={statusLabel} />
    </li>
  );
}

function StepLed({
  status,
  channel,
}: {
  status: StepStatus;
  channel?: "a" | "b";
}) {
  const reduced = useReducedMotion();
  const channelRing =
    channel === "a"
      ? "ring-(--channel-a)/45"
      : channel === "b"
        ? "ring-(--channel-b)/45"
        : "ring-border/60";

  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex size-2.5 shrink-0 rounded-full ring-2 ring-offset-1 ring-offset-card",
        channelRing,
        status === "idle" && "bg-muted",
        status === "running" && "bg-primary",
        status === "done" && "bg-chart-4",
        status === "error" && "bg-destructive",
      )}
    >
      {status === "running" && !reduced ? (
        <span className="absolute inset-0 animate-ping rounded-full bg-primary opacity-60" />
      ) : null}
    </span>
  );
}

function StepStatusBadge({
  status,
  label,
}: {
  status: StepStatus;
  label: string;
}) {
  return (
    <Badge
      variant={
        status === "error"
          ? "destructive"
          : status === "done"
            ? "default"
            : status === "running"
              ? "secondary"
              : "outline"
      }
      className="mt-px shrink-0 tabular-nums"
    >
      {status === "running" ? (
        <Spinner className="size-3" data-icon="inline-start" />
      ) : null}
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
  active,
  hasData,
}: {
  tone: "a" | "b";
  title: string;
  subtitle: string;
  label: string;
  transcript?: string;
  summary?: string;
  empty: string;
  active: boolean;
  hasData: boolean;
}) {
  const [tab, setTab] = useState<"transcript" | "summary">("transcript");
  const [, startTransition] = useTransition();
  const reduced = useReducedMotion();

  function selectTab(next: "transcript" | "summary") {
    startTransition(() => {
      withViewTransition(() => setTab(next));
    });
  }

  return (
    <motion.div
      layout
      animate={
        reduced
          ? undefined
          : {
              scale: active ? 1.008 : 1,
            }
      }
      transition={spring}
      className={cn(
        "rounded-xl transition-shadow duration-500",
        active && tone === "a" && "channel-glow-a",
        active && tone === "b" && "channel-glow-b",
        !active && hasData && "opacity-95",
      )}
    >
      <Card
        className={cn(
          "border-border/80 bg-card/95 backdrop-blur-sm",
          tone === "a"
            ? "border-t-2 border-t-(--channel-a)/60"
            : "border-t-2 border-t-(--channel-b)/60",
        )}
      >
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "size-2 rounded-full",
                  tone === "a" ? "bg-(--channel-a)" : "bg-(--channel-b)",
                  active && "animate-pulse",
                )}
              />
              <CardTitle>{title}</CardTitle>
            </div>
            <Badge variant="outline" className="font-mono text-[10px]">
              {label}
            </Badge>
          </div>
          <CardDescription>{subtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          {hasData ? (
            <Tabs
              value={tab}
              onValueChange={(v) =>
                selectTab(v as "transcript" | "summary")
              }
            >
              <TabsList className="w-full">
                <TabsTrigger value="transcript" className="flex-1">
                  Transcript
                </TabsTrigger>
                <TabsTrigger value="summary" className="flex-1">
                  Summary
                </TabsTrigger>
              </TabsList>
              <TabsContent value="transcript" className="mt-3">
                <ChannelPanel text={transcript || "—"} />
              </TabsContent>
              <TabsContent value="summary" className="mt-3">
                <ChannelPanel text={summary || "—"} />
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
    </motion.div>
  );
}

function ChannelPanel({ text }: { text: string }) {
  return (
    <div
      className="channel-panel rounded-lg border border-border bg-muted/20 p-3"
      style={{ viewTransitionName: "channel-panel" }}
    >
      <ScrollArea className="h-72">
        <pre className="font-mono text-xs leading-5 whitespace-pre-wrap">
          {text}
        </pre>
      </ScrollArea>
    </div>
  );
}

function JudgePanel({
  report,
  judging,
}: {
  report: JudgeReport | null;
  judging: boolean;
}) {
  if (!report) {
    return (
      <Card className="border-border/80 bg-card/90">
        <CardHeader>
          <CardTitle>Judge report</CardTitle>
          <CardDescription>
            Scores, missed points, and which stack held up.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Empty className="border border-dashed py-12">
            <EmptyHeader>
              {judging ? (
                <EmptyMedia variant="icon">
                  <Spinner className="size-5" />
                </EmptyMedia>
              ) : null}
              <EmptyTitle>
                {judging ? "Deliberating…" : "No verdict yet"}
              </EmptyTitle>
              <EmptyDescription>
                {judging
                  ? "The Lungoor-Notes judge script is scoring both pipelines."
                  : "The judge runs after both summaries land."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    );
  }

  const { comparison, soniox, deepgram, steps } = report;
  const winnerTone =
    comparison.winner === "soniox"
      ? "a"
      : comparison.winner === "deepgram"
        ? "b"
        : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
    >
      <Card className="overflow-hidden border-border/80 bg-card/95 shadow-lg">
        <CardHeader className="border-b border-border/60 bg-muted/20">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Judge report</CardTitle>
              <CardDescription>{comparison.notes}</CardDescription>
            </div>
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 24, delay: 0.15 }}
              style={{ viewTransitionName: "judge-verdict" }}
            >
              <Badge
                className={cn(
                  "px-4 py-1.5 text-sm capitalize",
                  winnerTone === "a" &&
                    "border-(--channel-a)/50 bg-(--channel-a)/15 text-(--channel-a)",
                  winnerTone === "b" &&
                    "border-(--channel-b)/50 bg-(--channel-b)/15 text-(--channel-b)",
                )}
                variant="outline"
              >
                Winner · {comparison.winner}
              </Badge>
            </motion.div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 pt-5">
          <div className="grid gap-3 md:grid-cols-2">
            <motion.div
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...spring, delay: 0.2 }}
            >
              <Alert>
                <AlertTitle>Good</AlertTitle>
                <AlertDescription>{comparison.whichWasGood}</AlertDescription>
              </Alert>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...spring, delay: 0.28 }}
            >
              <Alert variant="destructive">
                <AlertTitle>Weak</AlertTitle>
                <AlertDescription>{comparison.whichWasBad}</AlertDescription>
              </Alert>
            </motion.div>
          </div>

          <div className="flex flex-wrap gap-2 font-mono text-xs text-muted-foreground">
            <span>STT: {comparison.transcriptionWinner}</span>
            <Separator orientation="vertical" className="h-4" />
            <span>Summary: {comparison.summarizationWinner}</span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <ScoreCard title="Soniox" tone="a" judgement={soniox} />
            <ScoreCard title="Deepgram" tone="b" judgement={deepgram} />
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
              {steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function ScoreCard({
  title,
  tone,
  judgement,
}: {
  title: string;
  tone: "a" | "b";
  judgement: JudgeReport["soniox"];
}) {
  const entries = Object.entries(judgement.dimensions);
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <span
            className={cn(
              "size-2 rounded-full",
              tone === "a" ? "bg-(--channel-a)" : "bg-(--channel-b)",
            )}
          />
          {title}
        </p>
        <Badge variant="outline" className="font-mono text-[10px]">
          {judgement.verdict} · {judgement.overallScore}/5
        </Badge>
      </div>
      <div className="space-y-3">
        {entries.map(([key, dim], i) => (
          <AnimatedScoreBar
            key={key}
            label={key.replace("_", " ")}
            score={dim.score}
            delay={0.35 + i * 0.07}
            tone={tone}
          />
        ))}
      </div>
    </div>
  );
}

function AnimatedScoreBar({
  label,
  score,
  delay,
  tone,
}: {
  label: string;
  score: number;
  delay: number;
  tone: "a" | "b";
}) {
  const reduced = useReducedMotion();
  const pct = (score / 5) * 100;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="capitalize">{label}</span>
        <span className="tabular-nums text-muted-foreground">{score}/5</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <motion.div
          className={cn(
            "h-full rounded-full",
            tone === "a" ? "bg-(--channel-a)" : "bg-(--channel-b)",
          )}
          initial={{ width: reduced ? `${pct}%` : 0 }}
          animate={{ width: `${pct}%` }}
          transition={
            reduced
              ? { duration: 0 }
              : { type: "spring", stiffness: 120, damping: 20, delay }
          }
        />
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
