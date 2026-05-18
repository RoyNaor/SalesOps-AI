import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AlertCircle, ClipboardList, Clock3, Play, RefreshCw } from "lucide-react";
import { createExamSession, fetchExamScenarios, getApiErrorMessage } from "../api/client";

const examDurationMinutes = 3;

export default function ExamStartPage() {
  const navigate = useNavigate();
  const [selectedScenarioId, setSelectedScenarioId] = useState("");
  const {
    data,
    error,
    isError,
    isFetching,
    isLoading,
    refetch
  } = useQuery({
    queryKey: ["exam-scenarios"],
    queryFn: fetchExamScenarios
  });

  const scenarios = data?.scenarios ?? [];
  const selectedScenario = useMemo(
    () => scenarios.find((scenario) => scenario.scenarioId === selectedScenarioId) || null,
    [scenarios, selectedScenarioId]
  );
  const createSessionMutation = useMutation({
    mutationFn: createExamSession,
    onSuccess: ({ session }) => {
      navigate(`/exam/${session.sessionId}`, { replace: true });
    }
  });
  const durationMinutes = Math.ceil((data?.durationSeconds ?? examDurationMinutes * 60) / 60);
  const hasOptions = scenarios.length > 0;
  const isStartDisabled = !selectedScenario || isLoading || isError || createSessionMutation.isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedScenario) {
      return;
    }

    createSessionMutation.mutate(selectedScenario.scenarioId);
  }

  return (
    <section className="exam-start-layout">
      <header className="exam-start-header">
        <span className="eyebrow">Rep exam</span>
        <h1>Start Scenario Exam</h1>
        <p>Choose scenario, review brief, then start when ready.</p>
      </header>

      <div className="exam-start-grid">
        <form className="exam-start-panel" onSubmit={handleSubmit}>
          <div className="panel-heading">
            <ClipboardList aria-hidden="true" size={20} />
            <div>
              <h2>Scenario setup</h2>
              <p>Select published scenario for this exam attempt.</p>
            </div>
          </div>

          <label>
            Scenario
            <select
              value={selectedScenarioId}
              onChange={(event) => setSelectedScenarioId(event.target.value)}
              disabled={isLoading || isError || !hasOptions}
            >
              <option value="">
                {isLoading ? "Loading scenarios..." : hasOptions ? "Choose published scenario" : "No published scenarios"}
              </option>
              {scenarios.map((scenario) => (
                <option key={scenario.scenarioId} value={scenario.scenarioId}>
                  {scenario.title}
                </option>
              ))}
            </select>
          </label>

          {isError ? (
            <div className="exam-start-alert" role="alert">
              <AlertCircle aria-hidden="true" size={18} />
              <span>{getApiErrorMessage(error, "Tests unavailable.")}</span>
              <button type="button" className="text-button" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw aria-hidden="true" size={15} />
                Retry
              </button>
            </div>
          ) : null}

          {!isLoading && !isError && !hasOptions ? (
            <div className="exam-start-alert muted-panel" role="status">
              <AlertCircle aria-hidden="true" size={18} />
              <span>No published scenarios are ready yet.</span>
            </div>
          ) : null}

          {createSessionMutation.isError ? (
            <div className="exam-start-alert" role="alert">
              <AlertCircle aria-hidden="true" size={18} />
              <span>{getApiErrorMessage(createSessionMutation.error, "Exam session could not start.")}</span>
            </div>
          ) : null}

          <button type="submit" className="primary-button exam-start-button" disabled={isStartDisabled}>
            {createSessionMutation.isPending ? "Starting..." : "Start"}
            <Play aria-hidden="true" size={18} />
          </button>
        </form>

        <aside className="exam-brief-panel" aria-live="polite">
          <div>
            <span className="eyebrow">Exam brief</span>
            <h2>{selectedScenario?.title || "Select scenario"}</h2>
          </div>

          <p className={selectedScenario ? "exam-brief-copy" : "exam-brief-copy empty"}>
            {selectedScenario?.description || "Scenario description appears here after selection."}
          </p>

          <div className="exam-brief-meta">
            <Clock3 aria-hidden="true" size={19} />
            <div>
              <span>Time to complete</span>
              <strong>{durationMinutes} minutes</strong>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
