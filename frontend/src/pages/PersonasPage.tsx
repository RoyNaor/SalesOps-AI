import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit3, Save, UserPlus } from "lucide-react";
import {
  createPersona,
  fetchPersonas,
  getApiErrorMessage,
  updatePersona
} from "../api/client";
import type { Persona, PersonaFormPayload } from "../api/client";

const emptyForm: PersonaFormPayload = {
  name: "",
  description: "",
  behaviorNotes: ""
};

export default function PersonasPage() {
  const queryClient = useQueryClient();
  const { data: personas = [], isLoading } = useQuery({
    queryKey: ["personas"],
    queryFn: fetchPersonas
  });
  const [editingPersonaId, setEditingPersonaId] = useState("");
  const [form, setForm] = useState<PersonaFormPayload>(emptyForm);
  const [error, setError] = useState("");

  const createMutation = useMutation({
    mutationFn: createPersona,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["personas"] });
      setForm(emptyForm);
      setEditingPersonaId("");
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ personaId, payload }: { personaId: string; payload: PersonaFormPayload }) =>
      updatePersona(personaId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["personas"] });
      setForm(emptyForm);
      setEditingPersonaId("");
    }
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  function startEdit(persona: Persona) {
    setError("");
    setEditingPersonaId(persona.personaId);
    setForm({
      name: persona.name,
      description: persona.description,
      behaviorNotes: persona.behaviorNotes
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    try {
      if (editingPersonaId) {
        await updateMutation.mutateAsync({ personaId: editingPersonaId, payload: form });
      } else {
        await createMutation.mutateAsync(form);
      }
    } catch (err) {
      setError(getApiErrorMessage(err, "Persona save failed."));
    }
  }

  return (
    <section className="builder-layout">
      <div className="section-title-row">
        <div>
          <span className="eyebrow">Manager library</span>
          <h2>Personas</h2>
        </div>
        <span className="count-badge">{personas.length}</span>
      </div>

      <div className="content-grid">
        <form className="scenario-form" onSubmit={handleSubmit}>
          <div className="panel-heading">
            <UserPlus aria-hidden="true" size={20} />
            <div>
              <h3>{editingPersonaId ? "Edit persona" : "Create persona"}</h3>
              <p>Reusable customer behavior for future issue generation.</p>
            </div>
          </div>

          <label>
            Name
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Frustrated finance manager"
              required
            />
          </label>

          <label>
            Description
            <textarea
              className="textarea-short"
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="Owns renewal approvals and needs billing clarity before adding seats."
            />
          </label>

          <label>
            Behavior notes
            <textarea
              value={form.behaviorNotes}
              onChange={(event) => setForm((current) => ({ ...current, behaviorNotes: event.target.value }))}
              placeholder="Direct, time-sensitive, expects ownership and a clear next step."
            />
          </label>

          {error ? <p className="form-error">{error}</p> : null}

          <div className="button-row">
            {editingPersonaId ? (
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setEditingPersonaId("");
                  setForm(emptyForm);
                  setError("");
                }}
              >
                New persona
              </button>
            ) : null}
            <button type="submit" className="primary-button" disabled={isSaving}>
              <Save aria-hidden="true" size={18} />
              {isSaving ? "Saving..." : "Save persona"}
            </button>
          </div>
        </form>

        <div className="library-panel">
          {isLoading ? (
            <p className="empty-state">Loading personas...</p>
          ) : personas.length ? (
            <div className="resource-list">
              {personas.map((persona) => (
                <article
                  className={`resource-card ${persona.personaId === editingPersonaId ? "active" : ""}`}
                  key={persona.personaId}
                >
                  <div>
                    <span className="status-badge">{persona.status}</span>
                    <h3>{persona.name}</h3>
                    <p>{persona.description || "No description yet."}</p>
                  </div>
                  <button className="secondary-button" type="button" onClick={() => startEdit(persona)}>
                    <Edit3 aria-hidden="true" size={16} />
                    Edit
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">Create first persona before building scenarios.</p>
          )}
        </div>
      </div>
    </section>
  );
}
