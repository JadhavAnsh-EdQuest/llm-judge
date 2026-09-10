export type PipelineId = "soniox" | "deepgram";

export type TranscriptResult = {
  label: string;
  transcript: string;
};

export type SummaryResult = {
  summary: string;
};

export type DimensionScore = {
  score: number;
  rationale: string;
};

export type PipelineJudgement = {
  label: string;
  verdict: "pass" | "borderline" | "fail";
  overallScore: number;
  dimensions: {
    faithfulness: DimensionScore;
    completeness: DimensionScore;
    action_items: DimensionScore;
    attribution: DimensionScore;
    conciseness: DimensionScore;
  };
  hallucinations: { claim: string; why: string }[];
  omissions: { fact: string; whyItMatters: string }[];
  notes: string;
};

export type ComparisonReport = {
  winner: PipelineId | "tie";
  transcriptionWinner: PipelineId | "tie";
  summarizationWinner: PipelineId | "tie";
  whichWasGood: string;
  whichWasBad: string;
  missedPoints: {
    soniox: { fact: string; whyItMatters: string }[];
    deepgram: { fact: string; whyItMatters: string }[];
  };
  notes: string;
};

export type JudgeReport = {
  steps: string[];
  soniox: PipelineJudgement;
  deepgram: PipelineJudgement;
  comparison: ComparisonReport;
};
