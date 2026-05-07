import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Edit3, Rocket, Save } from "lucide-react";
import {
  createScenario,
  fetchPersonas,
  fetchScenarios,
  getApiErrorMessage,
  publishScenario,
  updateScenario
} from "../api/client";
import type { Scenario, ScenarioFormPayload } from "../api/client";

const emptyForm: ScenarioFormPayload = {
  title: "",
  description: "",
  personaIds: []
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

  const isSaving = saveMutation.isPending || publishMutation.isPending;

  function togglePersona(personaId: string) {
    setForm((current) => ({
      ...current,
      personaIds: current.personaIds.includes(personaId)
        ? current.personaIds.filter((id) => id !== personaId)
        : [...current.personaIds, personaId]
    }));
  }

  function startEdit(scenario: Scenario) {
    setError("");
    setEditingScenarioId(scenario.scenarioId);
    setForm({
      title: scenario.title,
      description: scenario.description,
      personaIds: scenario.personaIds
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
              <p>Select personas now. LLM issue generation comes later.</p>
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

          <fieldset className="checkbox-list">
            <legend>Personas</legend>
            {isLoadingPersonas ? (
              <p className="empty-state">Loading personas...</p>
            ) : personas.length ? (
              personas.map((persona) => (
                <label className="checkbox-item" key={persona.personaId}>
                  <input
                    type="checkbox"
                    checked={form.personaIds.includes(persona.personaId)}
                    onChange={() => togglePersona(persona.personaId)}
                  />
                  <span>
                    <strong>{persona.name}</strong>
                    <small>{persona.description || "No description yet."}</small>
                  </span>
                </label>
              ))
            ) : (
              <p className="empty-state">Create personas before publishing scenarios.</p>
            )}
          </fieldset>

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
        </div>
      </div>
    </section>
  );
}
