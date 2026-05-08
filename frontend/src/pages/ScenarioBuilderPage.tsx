import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Edit3, Rocket, Save } from "lucide-react";
import {
  createScenario,
  fetchPersonas,
  fetchScenarios,
  generateScenarioIssues,
  getApiErrorMessage,
  publishScenario,
  updateScenario,
  updateScenarioIssue
} from "../api/client";
import type { Scenario, ScenarioFormPayload, ScenarioIssueUpdatePayload } from "../api/client";

const emptyForm: ScenarioFormPayload = {
  title: "",
  description: "",
  personaIds: [],
  issueCount: 5
};

export default function ScenarioBuilderPage() {
  const queryClient = useQueryClient();
  const { data: personas = [], isLoading: isLoadingPersonas } = useQuery({
    queryKey: ["personas"],
    queryFn: fetchPersonas
  });
  const { data: scenarios = [], isLoading: isLoadingScenarios } = useQuery({
    queryKey: ["scenarios"],
    queryFn: fetchScenarios
  });
  const [editingScenarioId, setEditingScenarioId] = useState("");
  const [form, setForm] = useState<ScenarioFormPayload>(emptyForm);
  const [error, setError] = useState("");

  const personasById = useMemo(
    () => new Map(personas.map((persona) => [persona.personaId, persona.name])),
    [personas]
  );
  const selectedScenario = useMemo(
    () => scenarios.find((scenario) => scenario.scenarioId === editingScenarioId) || null,
    [editingScenarioId, scenarios]
  );
  const [issueDrafts, setIssueDrafts] = useState<Record<string, ScenarioIssueUpdatePayload>>({});

  useEffect(() => {
    if (!selectedScenario) {
      setIssueDrafts({});
      return;
    }

    setIssueDrafts(
      Object.fromEntries(
        selectedScenario.issues.map((issue) => [
          issue.issueId,
          {
            customerName: issue.customerName,
            subject: issue.subject,
            message: issue.message,
            difficulty: issue.difficulty
          }
        ])
      )
    );
  }, [selectedScenario]);

  async function saveCurrentScenario() {
    if (editingScenarioId) {
      return updateScenario(editingScenarioId, form);
    }

    return createScenario(form);
  }

  const saveMutation = useMutation({
    mutationFn: saveCurrentScenario,
    onSuccess: async (scenario) => {
      setEditingScenarioId(scenario.scenarioId);
      await queryClient.invalidateQueries({ queryKey: ["scenarios"] });
    }
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      const scenario = await saveCurrentScenario();
      return publishScenario(scenario.scenarioId);
    },
    onSuccess: async (scenario) => {
      setEditingScenarioId(scenario.scenarioId);
      await queryClient.invalidateQueries({ queryKey: ["scenarios"] });
    }
  });

  const generateIssuesMutation = useMutation({
    mutationFn: generateScenarioIssues,
    onSuccess: async (scenario) => {
      setEditingScenarioId(scenario.scenarioId);
      await queryClient.invalidateQueries({ queryKey: ["scenarios"] });
    }
  });

  const updateIssueMutation = useMutation({
    mutationFn: ({
      scenarioId,
      issueId,
      payload
    }: {
      scenarioId: string;
      issueId: string;
      payload: ScenarioIssueUpdatePayload;
    }) => updateScenarioIssue(scenarioId, issueId, payload),
    onSuccess: async (scenario) => {
      setEditingScenarioId(scenario.scenarioId);
      await queryClient.invalidateQueries({ queryKey: ["scenarios"] });
    }
  });

  const isSaving = saveMutation.isPending || publishMutation.isPending;

  function startEdit(scenario: Scenario) {
    setError("");
    setEditingScenarioId(scenario.scenarioId);
    setForm({
      title: scenario.title,
      description: scenario.description,
      personaIds: scenario.personaIds,
      issueCount: scenario.issueCount
    });
  }

  function updateIssueDraft(issueId: string, patch: Partial<ScenarioIssueUpdatePayload>) {
    setIssueDrafts((current) => {
      const currentDraft = current[issueId] || {
        customerName: "",
        subject: "",
        message: "",
        difficulty: "MEDIUM" as const
      };

      return {
        ...current,
        [issueId]: {
          ...currentDraft,
          ...patch
        }
      };
    });
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    try {
      await saveMutation.mutateAsync();
    } catch (err) {
      setError(getApiErrorMessage(err, "Scenario save failed."));
    }
  }

  async function handlePublish() {
    setError("");

    try {
      await publishMutation.mutateAsync();
    } catch (err) {
      setError(getApiErrorMessage(err, "Scenario publish failed."));
    }
  }

  async function handleGenerateIssues() {
    if (!selectedScenario) {
      return;
    }

    setError("");

    try {
      await generateIssuesMutation.mutateAsync(selectedScenario.scenarioId);
    } catch (err) {
      setError(getApiErrorMessage(err, "Issue generation failed."));
    }
  }

  async function handleSaveIssue(issueId: string) {
    if (!selectedScenario || !issueDrafts[issueId]) {
      return;
    }

    setError("");

    try {
      await updateIssueMutation.mutateAsync({
        scenarioId: selectedScenario.scenarioId,
        issueId,
        payload: issueDrafts[issueId]
      });
    } catch (err) {
      setError(getApiErrorMessage(err, "Issue save failed."));
    }
  }

  return (
    <section className="builder-layout">
      <div className="section-title-row">
        <div>
          <span className="eyebrow">Manager workflow</span>
          <h2>Scenarios</h2>
        </div>
        <span className="count-badge">{scenarios.length}</span>
      </div>

      <div className="content-grid">
        <form className="scenario-form" onSubmit={handleSave}>
          <div className="panel-heading">
            <Save aria-hidden="true" size={20} />
            <div>
              <h3>{editingScenarioId ? "Edit scenario" : "Create scenario"}</h3>
              <p>Select persona and issue count before publishing.</p>
            </div>
          </div>

          <label>
            Title
            <input
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="Q2 renewal pressure test"
              required
            />
          </label>

          <label>
            Description
            <textarea
              className="textarea-short"
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="Rep handles renewal friction, billing concerns, and expansion pressure."
            />
          </label>

          <label>
            Persona
            <select
              value={form.personaIds[0] || ""}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  personaIds: event.target.value ? [event.target.value] : []
                }))
              }
              disabled={isLoadingPersonas || personas.length === 0}
            >
              <option value="">
                {isLoadingPersonas ? "Loading personas..." : "Choose persona"}
              </option>
              {personas.map((persona) => (
                <option value={persona.personaId} key={persona.personaId}>
                  {persona.name}
                </option>
              ))}
            </select>
            {!isLoadingPersonas && personas.length === 0 ? (
              <span className="field-help">Create personas before publishing scenarios.</span>
            ) : null}
          </label>

          <label>
            Issue count
            <input
              type="number"
              min={1}
              max={20}
              step={1}
              value={form.issueCount}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  issueCount: Number.isNaN(event.target.valueAsNumber) ? 5 : event.target.valueAsNumber
                }))
              }
              required
            />
            <span className="field-help">Choose 1-20 generated inbox issues.</span>
          </label>

          {error ? <p className="form-error">{error}</p> : null}

          <div className="button-row">
            {editingScenarioId ? (
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setEditingScenarioId("");
                  setForm(emptyForm);
                  setError("");
                }}
              >
                New scenario
              </button>
            ) : null}
            <button type="submit" className="secondary-button" disabled={isSaving}>
              <Save aria-hidden="true" size={18} />
              {saveMutation.isPending ? "Saving..." : "Save draft"}
            </button>
            <button type="button" className="primary-button" disabled={isSaving} onClick={handlePublish}>
              <Rocket aria-hidden="true" size={18} />
              {publishMutation.isPending ? "Publishing..." : "Publish"}
            </button>
          </div>
        </form>

        <div className="library-panel">
          {isLoadingScenarios ? (
            <p className="empty-state">Loading scenarios...</p>
          ) : scenarios.length ? (
            <div className="resource-list">
              {scenarios.map((scenario) => (
                <article
                  className={`resource-card ${scenario.scenarioId === editingScenarioId ? "active" : ""}`}
                  key={scenario.scenarioId}
                >
                  <div>
                    <span className="status-badge">{scenario.status}</span>
                    <h3>{scenario.title}</h3>
                    <p>{scenario.description || "No description yet."}</p>
                    <div className="inline-meta">
                      {scenario.personaIds.length ? (
                        scenario.personaIds.map((personaId) => (
                          <span key={personaId}>
                            <Check aria-hidden="true" size={14} />
                            {personasById.get(personaId) || "Unknown persona"}
                          </span>
                        ))
                      ) : (
                        <span>No personas selected</span>
                      )}
                      <span>{scenario.issueCount} issue target</span>
                      <span>{scenario.issues.length ? `${scenario.issues.length} generated` : "No issues generated"}</span>
                    </div>
                  </div>
                  <button className="secondary-button" type="button" onClick={() => startEdit(scenario)}>
                    <Edit3 aria-hidden="true" size={16} />
                    Edit
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">Save first scenario draft after choosing personas.</p>
          )}

          {selectedScenario ? (
            <section className="issue-panel">
              <div className="panel-heading">
                <Rocket aria-hidden="true" size={20} />
                <div>
                  <h3>Generated issues</h3>
                  <p>
                    {selectedScenario.status === "PUBLISHED"
                      ? `${selectedScenario.issueCount} issue target for this scenario.`
                      : "Publish scenario before generating issues."}
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="primary-button"
                disabled={selectedScenario.status !== "PUBLISHED" || generateIssuesMutation.isPending}
                onClick={handleGenerateIssues}
              >
                <Rocket aria-hidden="true" size={18} />
                {generateIssuesMutation.isPending
                  ? "Generating..."
                  : `${selectedScenario.issues.length ? "Regenerate" : "Generate"} ${
                      selectedScenario.issueCount
                    } issues`}
              </button>

              {selectedScenario.issues.length ? (
                <div className="issue-list">
                  {selectedScenario.issues.map((issue) => {
                    const draft = issueDrafts[issue.issueId] || {
                      customerName: issue.customerName,
                      subject: issue.subject,
                      message: issue.message,
                      difficulty: issue.difficulty
                    };

                    return (
                      <article className="issue-card" key={issue.issueId}>
                        <div className="issue-card-title">
                          <strong>{personasById.get(issue.personaId) || "Unknown persona"}</strong>
                          <span className="status-badge">{issue.status}</span>
                        </div>

                        <label>
                          Customer
                          <input
                            value={draft.customerName}
                            onChange={(event) => updateIssueDraft(issue.issueId, { customerName: event.target.value })}
                          />
                        </label>

                        <label>
                          Subject
                          <input
                            value={draft.subject}
                            onChange={(event) => updateIssueDraft(issue.issueId, { subject: event.target.value })}
                          />
                        </label>

                        <label>
                          Message
                          <textarea
                            className="textarea-short"
                            value={draft.message}
                            onChange={(event) => updateIssueDraft(issue.issueId, { message: event.target.value })}
                          />
                        </label>

                        <label>
                          Difficulty
                          <select
                            value={draft.difficulty}
                            onChange={(event) =>
                              updateIssueDraft(issue.issueId, {
                                difficulty: event.target.value as ScenarioIssueUpdatePayload["difficulty"]
                              })
                            }
                          >
                            <option value="EASY">Easy</option>
                            <option value="MEDIUM">Medium</option>
                            <option value="HARD">Hard</option>
                          </select>
                        </label>

                        <button
                          type="button"
                          className="secondary-button"
                          disabled={updateIssueMutation.isPending}
                          onClick={() => handleSaveIssue(issue.issueId)}
                        >
                          <Save aria-hidden="true" size={16} />
                          Save issue
                        </button>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="empty-state">No generated issues yet.</p>
              )}
            </section>
          ) : null}
        </div>
      </div>
    </section>
  );
}
