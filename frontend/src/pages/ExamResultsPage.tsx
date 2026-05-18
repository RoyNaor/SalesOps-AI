import type { CSSProperties, ReactNode } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Brain, CheckCircle2, Lightbulb, Target, TrendingUp } from "lucide-react";
import { fetchExamEvaluation, getApiErrorMessage } from "../api/client";
import type { ExamEvaluation } from "../api/client";

const rubricItems: Array<{ key: keyof ExamEvaluation["rubric"]; label: string; weight: string }> = [
  { key: "kindness", label: "Kindness", weight: "25%" },
  { key: "professionalism", label: "Professionalism", weight: "25%" },
  { key: "resolution", label: "Resolution", weight: "25%" },
  { key: "clarity", label: "Clarity", weight: "15%" },
  { key: "helpfulIdeas", label: "Helpful ideas", weight: "10%" }
];

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function scoreStyle(score: number): CSSProperties {
  return { "--score": clampScore(score) } as CSSProperties;
}

function formatEvaluatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function ResultList({ items, empty }: { items: string[]; empty: string }) {
  const visibleItems = items.length ? items : [empty];
  return (
    <ul className={items.length ? "result-list" : "result-list muted"}>
      {visibleItems.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function InsightPanel({
  icon,
  title,
  items,
  empty
}: {
  icon: ReactNode;
  title: string;
  items: string[];
  empty: string;
}) {
  return (
    <section className="results-panel">
      <div className="panel-heading">
        {icon}
        <h2>{title}</h2>
      </div>
      <ResultList items={items} empty={empty} />
    </section>
  );
}

export default function ExamResultsPage() {
  const { sessionId } = useParams();

  const {
    data: evaluation,
    error,
    isError,
    isLoading
  } = useQuery({
    queryKey: ["exam-evaluation", sessionId],
    queryFn: () => fetchExamEvaluation(sessionId || ""),
    enabled: Boolean(sessionId)
  });

  if (!sessionId) {
    return <Navigate to="/exam/start" replace />;
  }

  if (isLoading) {
    return (
      <section className="results-layout">
        <p className="empty-state">Loading evaluation...</p>
      </section>
    );
  }

  if (isError || !evaluation) {
    return (
      <section className="results-layout">
        <div className="results-empty">
          <span className="eyebrow">Evaluation</span>
          <h1>Results are not ready</h1>
          <p>{getApiErrorMessage(error, "Exam evaluation could not load.")}</p>
          <Link className="secondary-button" to={`/exam/${sessionId}`}>
            <ArrowLeft aria-hidden="true" size={18} />
            Back to exam
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="results-layout">
      <header className="results-hero">
        <div>
          <span className="eyebrow">Exam evaluation</span>
          <h1>Final score</h1>
          <p>{formatEvaluatedAt(evaluation.evaluatedAt) || "Evaluation complete"}</p>
        </div>
        <div className="final-score-dial" style={scoreStyle(evaluation.score)} aria-label={`Final score ${evaluation.score}`}>
          <strong>{clampScore(evaluation.score)}</strong>
          <span>/100</span>
        </div>
      </header>

      <div className="results-grid">
        <section className="results-panel rubric-panel">
          <div className="panel-heading">
            <Target aria-hidden="true" size={20} />
            <h2>Rubric</h2>
          </div>
          <div className="rubric-list">
            {rubricItems.map((item) => (
              <div className="rubric-row" key={item.key}>
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.weight}</span>
                </div>
                <div className="rubric-meter" style={scoreStyle(evaluation.rubric[item.key])}>
                  <span />
                </div>
                <b>{clampScore(evaluation.rubric[item.key])}</b>
              </div>
            ))}
          </div>
        </section>

        <InsightPanel
          icon={<Brain aria-hidden="true" size={20} />}
          title="AI notes"
          items={evaluation.aiNotes}
          empty="No notes returned."
        />
        <InsightPanel
          icon={<CheckCircle2 aria-hidden="true" size={20} />}
          title="Strengths"
          items={evaluation.strengths}
          empty="No strengths returned."
        />
        <InsightPanel
          icon={<TrendingUp aria-hidden="true" size={20} />}
          title="Growth areas"
          items={evaluation.growthAreas}
          empty="No growth areas returned."
        />
        <InsightPanel
          icon={<Lightbulb aria-hidden="true" size={20} />}
          title="Practice ideas"
          items={evaluation.practiceIdeas}
          empty="No practice ideas returned."
        />
      </div>

      <section className="issue-feedback-section">
        <div className="section-title-row">
          <div>
            <span className="eyebrow">Issue feedback</span>
            <h2>Per-inquiry coaching</h2>
          </div>
          <Link className="secondary-button" to="/exam/start">
            New exam
          </Link>
        </div>

        <div className="issue-feedback-list">
          {evaluation.issues.map((issue) => (
            <article className="issue-feedback-item" key={issue.issueId}>
              <div className="issue-feedback-score" style={scoreStyle(issue.score)}>
                <strong>{clampScore(issue.score)}</strong>
                <span>/100</span>
              </div>
              <div>
                <h3>{issue.subject}</h3>
                <ResultList items={issue.notes} empty="No issue notes returned." />
                <div className="answer-ideas">
                  <strong>Suggested answer ideas</strong>
                  <ResultList items={issue.suggestedAnswerIdeas} empty="No answer ideas returned." />
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
