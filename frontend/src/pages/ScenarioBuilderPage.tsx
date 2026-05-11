import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Edit3, Plus, Rocket, Save, Search, SlidersHorizontal, X } from "lucide-react";
import { DataTable } from "../components/ui/basic-data-table";
import type { DataTableColumn } from "../components/ui/basic-data-table";
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

type ScenarioTableRow = {
  scenarioId: string;
  title: string;
  description: string;
  status: string;
  persona: string;
  issueTarget: number;
  generated: number;
  generatedLabel: string;
  updatedAt: number;
  updatedLabel: string;
  actions: string;
  scenario: Scenario;
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
  const [selectedScenarioId, setSelectedScenarioId] = useState("");
  const [editingScenarioId, setEditingScenarioId] = useState("");
  const [isScenarioModalOpen, setScenarioModalOpen] = useState(false);
  const [isDetailModalOpen, setDetailModalOpen] = useState(false);
  const [form, setForm] = useState<ScenarioFormPayload>(emptyForm);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [personaFilter, setPersonaFilter] = useState("ALL");

  const personasById = useMemo(
    () => new Map(personas.map((persona) => [persona.personaId, persona.name])),
    [personas]
  );
  const selectedScenario = useMemo(
    () => scenarios.find((scenario) => scenario.scenarioId === selectedScenarioId) || null,
    [selectedScenarioId, scenarios]
  );
  const availableStatuses = useMemo(
    () => Array.from(new Set(scenarios.map((scenario) => scenario.status))).sort(),
    [scenarios]
  );
  const publishedCount = useMemo(
    () => scenarios.filter((scenario) => scenario.status === "PUBLISHED").length,
    [scenarios]
  );
  const filteredScenarios = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return scenarios.filter((scenario) => {
      const matchesStatus = statusFilter === "ALL" || scenario.status === statusFilter;
      const matchesPersona = personaFilter === "ALL" || scenario.personaIds.includes(personaFilter);
      const personaNames = scenario.personaIds
        .map((personaId) => personasById.get(personaId) || "")
        .join(" ")
        .toLowerCase();
      const searchableText = `${scenario.title} ${scenario.description} ${personaNames}`.toLowerCase();

      return matchesStatus && matchesPersona && (!normalizedSearch || searchableText.includes(normalizedSearch));
    });
  }, [personaFilter, personasById, scenarios, searchTerm, statusFilter]);
  const scenarioRows = useMemo<ScenarioTableRow[]>(
    () =>
      filteredScenarios.map((scenario) => {
        const persona = scenario.personaIds
          .map((personaId) => personasById.get(personaId) || "Unknown persona")
          .join(", ");

        return {
          scenarioId: scenario.scenarioId,
          title: scenario.title,
          description: scenario.description,
          status: scenario.status,
          persona: persona || "No persona",
          issueTarget: scenario.issueCount,
          generated: scenario.issues.length,
          generatedLabel: scenario.issuesGeneratedAt ? formatShortDate(scenario.issuesGeneratedAt) : "not generated",
          updatedAt: timestampForSort(scenario.updatedAt),
          updatedLabel: formatShortDate(scenario.updatedAt),
          actions: "",
          scenario
        };
      }),
    [filteredScenarios, personasById]
  );
  const scenarioColumns = useMemo<DataTableColumn<ScenarioTableRow>[]>(
    () => [
      {
        key: "title",
        header: "Scenario",
        sortable: true,
        width: "25%",
        render: (_value, row) => (
          <div className="scenario-name-cell">
            <strong>{row.title}</strong>
          </div>
        )
      },
      {
        key: "status",
        header: "Status",
        sortable: true,
        width: "12%",
        render: (value) => (
          <span className={`status-badge ${value === "PUBLISHED" ? "status-published" : "status-draft"}`}>
            {String(value)}
          </span>
        )
      },
      {
        key: "persona",
        header: "Persona",
        sortable: true,
        width: "21%",
        render: (_value, row) => (
          <div className="scenario-persona-stack">
            {row.scenario.personaIds.length ? (
              row.scenario.personaIds.map((personaId) => (
                <span key={personaId}>
                  <Check aria-hidden="true" size={14} />
                  {personasById.get(personaId) || "Unknown persona"}
                </span>
              ))
            ) : (
              <span>No persona</span>
            )}
          </div>
        )
      },
      {
        key: "issueTarget",
        header: "Issue plan",
        sortable: true,
        width: "10%",
        render: (value) => <strong>{String(value)}</strong>
      },
      {
        key: "generated",
        header: "Generated",
        sortable: true,
        width: "12%",
        render: (value) => <strong>{String(value)}</strong>
      },
      {
        key: "updatedAt",
        header: "Updated",
        sortable: true,
        width: "13%",
        render: (_value, row) => <span>{row.updatedLabel}</span>
      },
      {
        key: "actions",
        header: "Actions",
        width: "72px",
        render: (_value, row) => (
          <button
            className="icon-button"
            type="button"
            aria-label={`Edit ${row.title}`}
            onClick={(event) => {
              event.stopPropagation();
              startEdit(row.scenario);
            }}
          >
            <Edit3 aria-hidden="true" size={16} />
          </button>
        )
      }
    ],
    [personasById]
  );
  const [issueDrafts, setIssueDrafts] = useState<Record<string, ScenarioIssueUpdatePayload>>({});

  useEffect(() => {
    if (selectedScenarioId && !scenarios.some((scenario) => scenario.scenarioId === selectedScenarioId)) {
      setSelectedScenarioId("");
      setDetailModalOpen(false);
    }
  }, [scenarios, selectedScenarioId]);

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
      setSelectedScenarioId(scenario.scenarioId);
      setScenarioModalOpen(false);
      setForm(emptyForm);
      setEditingScenarioId("");
      await queryClient.invalidateQueries({ queryKey: ["scenarios"] });
    }
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      const scenario = await saveCurrentScenario();
      return publishScenario(scenario.scenarioId);
    },
    onSuccess: async (scenario) => {
      setSelectedScenarioId(scenario.scenarioId);
      setScenarioModalOpen(false);
      setForm(emptyForm);
      setEditingScenarioId("");
      await queryClient.invalidateQueries({ queryKey: ["scenarios"] });
    }
  });

  const generateIssuesMutation = useMutation({
    mutationFn: generateScenarioIssues,
    onSuccess: async (scenario) => {
      setSelectedScenarioId(scenario.scenarioId);
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
      setSelectedScenarioId(scenario.scenarioId);
      await queryClient.invalidateQueries({ queryKey: ["scenarios"] });
    }
  });

  const isSaving = saveMutation.isPending || publishMutation.isPending;

  useEffect(() => {
    if (!isScenarioModalOpen && !isDetailModalOpen) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      if (isScenarioModalOpen && !isSaving) {
        closeScenarioModal();
        return;
      }

      closeDetailModal();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDetailModalOpen, isScenarioModalOpen, isSaving]);

  function startCreate() {
    setError("");
    setDetailModalOpen(false);
    setEditingScenarioId("");
    setForm(emptyForm);
    setScenarioModalOpen(true);
  }

  function startEdit(scenario: Scenario) {
    setError("");
    setDetailModalOpen(false);
    setSelectedScenarioId(scenario.scenarioId);
    setEditingScenarioId(scenario.scenarioId);
    setForm({
      title: scenario.title,
      description: scenario.description,
      personaIds: scenario.personaIds,
      issueCount: scenario.issueCount
    });
    setScenarioModalOpen(true);
  }

  function closeScenarioModal() {
    setScenarioModalOpen(false);
    setEditingScenarioId("");
    setForm(emptyForm);
    setError("");
  }

  function openScenarioDetail(scenario: Scenario) {
    setError("");
    setSelectedScenarioId(scenario.scenarioId);
    setDetailModalOpen(true);
  }

  function closeDetailModal() {
    setDetailModalOpen(false);
    setError("");
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
    <section className="builder-layout scenario-workbench">
      <div className="section-title-row">
        <div>
          <span className="eyebrow">Manager workflow</span>
          <h2>Scenarios</h2>
        </div>
        <div className="scenario-summary-strip" aria-label="Scenario summary">
          <span>
            <strong>{publishedCount}</strong>
            Published
          </span>
          <span>
            <strong>{scenarios.length - publishedCount}</strong>
            Draft
          </span>
          <span>
            <strong>{scenarios.length}</strong>
            Total
          </span>
        </div>
      </div>

      <div className="scenario-command-bar">
        <label className="scenario-search-control">
          <Search aria-hidden="true" size={18} />
          <span className="visually-hidden">Search scenarios</span>
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search scenario or persona"
          />
        </label>

        <div className="scenario-filter-group" aria-label="Scenario filters">
          <SlidersHorizontal aria-hidden="true" size={18} />
          <label>
            <span>Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="ALL">All status</option>
              {availableStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Persona</span>
            <select value={personaFilter} onChange={(event) => setPersonaFilter(event.target.value)}>
              <option value="ALL">All personas</option>
              {personas.map((persona) => (
                <option key={persona.personaId} value={persona.personaId}>
                  {persona.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button type="button" className="primary-button scenario-add-button" onClick={startCreate}>
          <Plus aria-hidden="true" size={18} />
          Add scenario
        </button>
      </div>

      {error && !isScenarioModalOpen && !isDetailModalOpen ? <p className="form-error">{error}</p> : null}

      <DataTable
        className="scenario-data-table"
        compact
        columns={scenarioColumns}
        data={scenarioRows}
        emptyMessage={scenarios.length ? "No scenarios match current filters." : "Create first scenario draft."}
        getRowClassName={(row) => (row.scenarioId === selectedScenarioId ? "selected" : "")}
        itemsPerPage={10}
        loading={isLoadingScenarios}
        onRowClick={(row) => openScenarioDetail(row.scenario)}
        searchable={false}
        striped
      />

      {selectedScenario && isDetailModalOpen ? createPortal(
        <div className="modal-backdrop" onMouseDown={closeDetailModal}>
          <section
            aria-labelledby="scenario-detail-title"
            aria-modal="true"
            className="scenario-detail-modal"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="modal-title-row">
              <div>
                <span className="eyebrow">Scenario</span>
                <h3 id="scenario-detail-title">{selectedScenario.title}</h3>
                <p>{selectedScenario.description || "No description yet."}</p>
              </div>
              <button aria-label="Close scenario details" className="icon-button" type="button" onClick={closeDetailModal}>
                <X aria-hidden="true" size={18} />
              </button>
            </div>

            <div className="scenario-modal-stats" aria-label="Scenario stats">
              <span>
                <strong>{selectedScenario.issueCount}</strong>
                target
              </span>
              <span>
                <strong>{selectedScenario.issues.length}</strong>
                generated
              </span>
              <span>
                <strong>{selectedScenario.status}</strong>
                status
              </span>
              <span>
                <strong>{formatShortDate(selectedScenario.updatedAt)}</strong>
                updated
              </span>
            </div>

            <div className="scenario-modal-personas">
              {selectedScenario.personaIds.length ? (
                selectedScenario.personaIds.map((personaId) => (
                  <span key={personaId}>
                    <Check aria-hidden="true" size={14} />
                    {personasById.get(personaId) || "Unknown persona"}
                  </span>
                ))
              ) : (
                <span>No persona selected</span>
              )}
            </div>

            {error ? <p className="form-error">{error}</p> : null}

            <div className="detail-action-row">
              <button type="button" className="secondary-button" onClick={() => startEdit(selectedScenario)}>
                <Edit3 aria-hidden="true" size={16} />
                Edit scenario
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={selectedScenario.status !== "PUBLISHED" || generateIssuesMutation.isPending}
                onClick={handleGenerateIssues}
              >
                <Rocket aria-hidden="true" size={18} />
                {generateIssuesMutation.isPending
                  ? "Generating..."
                  : `${selectedScenario.issues.length ? "Regenerate" : "Generate"} issues`}
              </button>
            </div>

            <div className="issue-modal-section">
              <div className="panel-heading">
                <Rocket aria-hidden="true" size={18} />
                <div>
                  <h3>Generated issues</h3>
                  <p>
                    {selectedScenario.status === "PUBLISHED"
                      ? "Edit generated inbox issues here."
                      : "Publish scenario before generating issues."}
                  </p>
                </div>
              </div>

              {selectedScenario.issues.length ? (
                <div className="issue-list compact-issue-list">
                  {selectedScenario.issues.map((issue) => {
                    const draft = issueDrafts[issue.issueId] || {
                      customerName: issue.customerName,
                      subject: issue.subject,
                      message: issue.message,
                      difficulty: issue.difficulty
                    };

                    return (
                      <article className="issue-card compact-issue-card" key={issue.issueId}>
                        <div className="issue-card-title">
                          <strong>{personasById.get(issue.personaId) || "Unknown persona"}</strong>
                          <span className="status-badge">{issue.status}</span>
                        </div>

                        <div className="compact-issue-grid">
                          <label>
                            Customer
                            <input
                              value={draft.customerName}
                              onChange={(event) =>
                                updateIssueDraft(issue.issueId, { customerName: event.target.value })
                              }
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
                        </div>

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

                        <button
                          type="button"
                          className="secondary-button compact-save-button"
                          disabled={updateIssueMutation.isPending}
                          onClick={() => handleSaveIssue(issue.issueId)}
                        >
                          <Save aria-hidden="true" size={15} />
                          Save issue
                        </button>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="empty-state">No generated issues yet.</p>
              )}
            </div>
          </section>
        </div>,
        document.body
      ) : null}

      {isScenarioModalOpen ? createPortal(
        <div className="modal-backdrop" onMouseDown={closeScenarioModal}>
          <form
            aria-labelledby="scenario-modal-title"
            aria-modal="true"
            className="scenario-form scenario-modal"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={handleSave}
            role="dialog"
          >
            <div className="modal-title-row">
              <div className="panel-heading">
                <Save aria-hidden="true" size={20} />
                <div>
                  <h3 id="scenario-modal-title">{editingScenarioId ? "Edit scenario" : "Create scenario"}</h3>
                  <p>Select persona and issue count before publishing.</p>
                </div>
              </div>
              <button
                aria-label="Close scenario form"
                className="icon-button"
                disabled={isSaving}
                type="button"
                onClick={closeScenarioModal}
              >
                <X aria-hidden="true" size={18} />
              </button>
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

            <div className="form-row">
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
                  <option value="">{isLoadingPersonas ? "Loading personas..." : "Choose persona"}</option>
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
            </div>

            {error ? <p className="form-error">{error}</p> : null}

            <div className="button-row">
              <button type="button" className="secondary-button" disabled={isSaving} onClick={closeScenarioModal}>
                Cancel
              </button>
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
        </div>,
        document.body
      ) : null}
    </section>
  );
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

function timestampForSort(value: string) {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}
