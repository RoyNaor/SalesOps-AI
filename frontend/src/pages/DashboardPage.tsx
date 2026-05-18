import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, BarChart3, Download, PieChart, RefreshCw, SlidersHorizontal } from "lucide-react";
import { fetchDashboard, getApiErrorMessage } from "../api/client";
import type { DashboardRep, DashboardScoreBand } from "../api/client";
import { DataTable } from "../components/ui/basic-data-table";
import type { DataTableColumn } from "../components/ui/basic-data-table";

type ChartMode = "pie" | "columns";

type RepTableRow = {
  userId: string;
  name: string;
  email: string;
  attempts: number;
  latestScoreValue: number;
  latestScoreLabel: string;
  averageScore: number;
  bestScoreValue: number;
  bestScoreLabel: string;
  passRate: number;
  completionRate: number;
  lastAttemptSort: number;
  lastAttemptLabel: string;
  coachingFocus: string;
  evaluatedAttempts: number;
  needsEvaluation: number;
};

function scoreStyle(score: number): CSSProperties {
  return { "--score": Math.max(0, Math.min(100, Math.round(score))) } as CSSProperties;
}

function formatPercent(value: number) {
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function formatScore(value: number | null) {
  return value === null ? "-" : `${Math.round(value)}`;
}

function timestampForSort(value: string) {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function ScorePill({ score, label }: { score: number | null; label?: string }) {
  if (score === null) {
    return <span className="status-badge dashboard-muted-badge">Not evaluated</span>;
  }

  return (
    <span className="score-bar dashboard-score-pill" style={scoreStyle(score)}>
      {label || formatScore(score)}
    </span>
  );
}

function MetricCard({ label, value, help }: { label: string; value: string | number; help?: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
      {help ? <em>{help}</em> : null}
    </div>
  );
}

function PieChartGraphic({ bands }: { bands: DashboardScoreBand[] }) {
  const total = bands.reduce((sum, band) => sum + band.count, 0);
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="dashboard-pie-wrap">
      <svg aria-label="Success band distribution" className="dashboard-pie" role="img" viewBox="0 0 150 150">
        <circle cx="75" cy="75" fill="none" r={radius} stroke="#eadfc7" strokeWidth="24" />
        {total
          ? bands.map((band) => {
              const length = (band.count / total) * circumference;
              const segment = (
                <circle
                  cx="75"
                  cy="75"
                  fill="none"
                  key={band.label}
                  r={radius}
                  stroke={band.color}
                  strokeDasharray={`${length} ${circumference - length}`}
                  strokeDashoffset={-offset}
                  strokeWidth="24"
                  transform="rotate(-90 75 75)"
                />
              );
              offset += length;
              return segment;
            })
          : null}
      </svg>
      <div className="dashboard-pie-center">
        <strong>{total}</strong>
        <span>Attempts</span>
      </div>
    </div>
  );
}

function ColumnChart({ reps }: { reps: DashboardRep[] }) {
  const visibleReps = reps.slice(0, 8);
  const hasScores = visibleReps.some((rep) => rep.evaluatedAttempts > 0);

  if (!visibleReps.length || !hasScores) {
    return <p className="empty-state">No evaluated rep scores in this view.</p>;
  }

  return (
    <div className="dashboard-bars" aria-label="Average score by rep" role="img">
      {visibleReps.map((rep) => (
        <div className="dashboard-bar-item" key={rep.userId || rep.email || rep.name}>
          <div className="dashboard-bar-track">
            <span style={scoreStyle(rep.averageScore)} />
          </div>
          <strong>{rep.name}</strong>
          <em>{formatScore(rep.averageScore)}</em>
        </div>
      ))}
    </div>
  );
}

function exportCsv(rows: RepTableRow[]) {
  const headers = [
    "Rep",
    "Email",
    "Attempts",
    "Evaluated",
    "Average score",
    "Latest score",
    "Best score",
    "Pass rate",
    "Completion rate",
    "Needs evaluation",
    "Last attempt",
    "Coaching focus"
  ];
  const csvRows = rows.map((row) =>
    [
      row.name,
      row.email,
      row.attempts,
      row.evaluatedAttempts,
      row.averageScore,
      row.latestScoreLabel,
      row.bestScoreLabel,
      `${row.passRate}%`,
      `${row.completionRate}%`,
      row.needsEvaluation,
      row.lastAttemptLabel,
      row.coachingFocus
    ]
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(",")
  );
  const blob = new Blob([[headers.join(","), ...csvRows].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "salesops-dashboard-reps.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export default function DashboardPage() {
  const [scenarioId, setScenarioId] = useState("ALL");
  const [chartMode, setChartMode] = useState<ChartMode>("pie");
  const {
    data,
    error,
    isError,
    isFetching,
    isLoading,
    refetch
  } = useQuery({
    queryKey: ["dashboard", scenarioId],
    queryFn: () => fetchDashboard(scenarioId)
  });

  const summary = data?.summary;
  const repRows = useMemo<RepTableRow[]>(
    () =>
      (data?.reps ?? []).map((rep) => ({
        userId: rep.userId,
        name: rep.name || "Unknown rep",
        email: rep.email || "No email",
        attempts: rep.attempts,
        latestScoreValue: rep.latestScore ?? -1,
        latestScoreLabel: formatScore(rep.latestScore),
        averageScore: rep.averageScore,
        bestScoreValue: rep.bestScore ?? -1,
        bestScoreLabel: formatScore(rep.bestScore),
        passRate: rep.passRate,
        completionRate: rep.completionRate,
        lastAttemptSort: timestampForSort(rep.lastAttemptDate),
        lastAttemptLabel: formatShortDate(rep.lastAttemptDate),
        coachingFocus: rep.coachingFocus,
        evaluatedAttempts: rep.evaluatedAttempts,
        needsEvaluation: rep.needsEvaluation
      })),
    [data?.reps]
  );
  const repColumns = useMemo<DataTableColumn<RepTableRow>[]>(
    () => [
      {
        key: "name",
        header: "Rep",
        sortable: true,
        width: "22%",
        render: (_value, row) => (
          <div className="scenario-name-cell">
            <strong>{row.name}</strong>
            <span>{row.email}</span>
          </div>
        )
      },
      {
        key: "attempts",
        header: "Attempts",
        sortable: true,
        width: "10%"
      },
      {
        key: "averageScore",
        header: "Avg score",
        sortable: true,
        width: "12%",
        render: (value, row) => (
          <ScorePill score={row.evaluatedAttempts ? Number(value) : null} label={row.evaluatedAttempts ? undefined : ""} />
        )
      },
      {
        key: "latestScoreValue",
        header: "Latest",
        sortable: true,
        width: "11%",
        render: (_value, row) => <ScorePill score={row.latestScoreValue >= 0 ? row.latestScoreValue : null} />
      },
      {
        key: "passRate",
        header: "Pass",
        sortable: true,
        width: "10%",
        render: (value) => <span className="dashboard-percent">{formatPercent(Number(value))}</span>
      },
      {
        key: "completionRate",
        header: "Done",
        sortable: true,
        width: "10%",
        render: (value) => <span className="dashboard-percent">{formatPercent(Number(value))}</span>
      },
      {
        key: "lastAttemptSort",
        header: "Last",
        sortable: true,
        width: "12%",
        render: (_value, row) => <span>{row.lastAttemptLabel}</span>
      },
      {
        key: "coachingFocus",
        header: "Coaching focus",
        sortable: true,
        width: "23%"
      }
    ],
    []
  );
  const selectedScenarioLabel =
    scenarioId === "ALL"
      ? "All sessions"
      : data?.scenarios.find((scenario) => scenario.scenarioId === scenarioId)?.title || "Selected scenario";

  return (
    <section className="dashboard-layout manager-dashboard">
      <div className="section-title-row dashboard-title-row">
        <div>
          <span className="eyebrow">Management dashboard</span>
          <h2>Rep performance</h2>
        </div>
        <div className="scenario-summary-strip" aria-label="Dashboard summary">
          <span>
            <strong>{summary?.totalAttempts ?? 0}</strong>
            Attempts
          </span>
          <span>
            <strong>{data?.passScore ?? 80}</strong>
            Pass score
          </span>
        </div>
      </div>

      <div className="scenario-command-bar dashboard-command-bar">
        <div className="scenario-filter-group" aria-label="Dashboard controls">
          <SlidersHorizontal aria-hidden="true" size={18} />
          <label>
            <span>Session</span>
            <select value={scenarioId} onChange={(event) => setScenarioId(event.target.value)}>
              <option value="ALL">All sessions</option>
              {(data?.scenarios ?? []).map((scenario) => (
                <option key={scenario.scenarioId} value={scenario.scenarioId}>
                  {scenario.title} ({scenario.attempts})
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="chart-toggle" aria-label="Chart type">
          <button className={chartMode === "pie" ? "active" : ""} onClick={() => setChartMode("pie")} type="button">
            <PieChart aria-hidden="true" size={17} />
            <span>Pie</span>
          </button>
          <button
            className={chartMode === "columns" ? "active" : ""}
            onClick={() => setChartMode("columns")}
            type="button"
          >
            <BarChart3 aria-hidden="true" size={17} />
            <span>Columns</span>
          </button>
        </div>

        <button className="secondary-button scenario-add-button" disabled={!repRows.length} onClick={() => exportCsv(repRows)} type="button">
          <Download aria-hidden="true" size={17} />
          Export CSV
        </button>

        <button className="text-button dashboard-refresh" disabled={isFetching} onClick={() => refetch()} type="button">
          <RefreshCw aria-hidden="true" className={isFetching ? "spin-icon" : ""} size={16} />
          Refresh
        </button>
      </div>

      {isError ? (
        <div className="exam-start-alert" role="alert">
          <AlertCircle aria-hidden="true" size={18} />
          <span>{getApiErrorMessage(error, "Dashboard could not load.")}</span>
        </div>
      ) : null}

      <div className="metric-strip dashboard-metrics" aria-label="Dashboard metrics">
        <MetricCard
          help={`${summary?.evaluatedAttempts ?? 0} evaluated`}
          label="Avg success"
          value={summary?.evaluatedAttempts ? `${summary.avgSuccessScore}%` : "-"}
        />
        <MetricCard
          help={`Score ${data?.passScore ?? 80}+`}
          label="Pass rate"
          value={summary?.evaluatedAttempts ? formatPercent(summary.passRate) : "-"}
        />
        <MetricCard label="Reps evaluated" value={summary?.repsEvaluated ?? 0} />
        <MetricCard label="Attempts completed" value={summary?.completedAttempts ?? 0} />
        <MetricCard label="Needs evaluation" value={summary?.needsEvaluation ?? 0} />
      </div>

      <div className="dashboard-grid">
        <section className="dashboard-panel dashboard-chart-panel">
          <div className="section-title-row">
            <div>
              <span className="eyebrow">{selectedScenarioLabel}</span>
              <h2>{chartMode === "pie" ? "Success bands" : "Rep score columns"}</h2>
            </div>
          </div>

          {isLoading ? (
            <p className="empty-state">Loading dashboard...</p>
          ) : chartMode === "pie" ? (
            <div className="dashboard-chart-content">
              <PieChartGraphic bands={data?.scoreBands ?? []} />
              <div className="dashboard-band-list">
                {(data?.scoreBands ?? []).map((band) => (
                  <div key={band.label}>
                    <span style={{ background: band.color }} />
                    <strong>{band.label}</strong>
                    <em>
                      {band.count} ({band.percent}%)
                    </em>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <ColumnChart reps={data?.reps ?? []} />
          )}
        </section>

        <section className="dashboard-panel dashboard-queue-panel">
          <div className="section-title-row">
            <div>
              <span className="eyebrow">Coaching queue</span>
              <h2>Needs attention</h2>
            </div>
          </div>
          <div className="coaching-queue">
            {repRows
              .filter((rep) => rep.needsEvaluation || rep.averageScore < (data?.passScore ?? 80))
              .slice(0, 5)
              .map((rep) => (
                <article key={rep.userId || rep.email}>
                  <div>
                    <strong>{rep.name}</strong>
                    <span>{rep.coachingFocus}</span>
                  </div>
                  <ScorePill score={rep.evaluatedAttempts ? rep.averageScore : null} />
                </article>
              ))}
            {!repRows.length || repRows.every((rep) => !rep.needsEvaluation && rep.averageScore >= (data?.passScore ?? 80)) ? (
              <p className="empty-state">No reps need attention in this view.</p>
            ) : null}
          </div>
        </section>
      </div>

      <div className="results-table-wrap dashboard-table-wrap">
        <div className="section-title-row">
          <div>
            <span className="eyebrow">Rep roster</span>
            <h2>{selectedScenarioLabel}</h2>
          </div>
        </div>

        <DataTable
          className="scenario-data-table dashboard-data-table"
          columns={repColumns}
          compact
          data={repRows}
          emptyMessage={
            scenarioId === "ALL" ? "No exam attempts found yet." : "No reps attempted this selected session yet."
          }
          itemsPerPage={8}
          loading={isLoading}
          searchable={false}
          striped
        />
      </div>
    </section>
  );
}
