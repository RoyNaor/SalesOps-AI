import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit3, Plus, Save, Search, SlidersHorizontal, UserPlus, X } from "lucide-react";
import { DataTable } from "../components/ui/basic-data-table";
import type { DataTableColumn } from "../components/ui/basic-data-table";
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

type PersonaTableRow = {
  personaId: string;
  name: string;
  description: string;
  behaviorNotes: string;
  status: string;
  updatedAt: number;
  updatedLabel: string;
  actions: string;
  persona: Persona;
};

export default function PersonasPage() {
  const queryClient = useQueryClient();
  const { data: personas = [], isLoading } = useQuery({
    queryKey: ["personas"],
    queryFn: fetchPersonas
  });
  const [editingPersonaId, setEditingPersonaId] = useState("");
  const [isPersonaModalOpen, setPersonaModalOpen] = useState(false);
  const [form, setForm] = useState<PersonaFormPayload>(emptyForm);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const activeCount = useMemo(
    () => personas.filter((persona) => persona.status === "ACTIVE").length,
    [personas]
  );
  const availableStatuses = useMemo(
    () => Array.from(new Set(personas.map((persona) => persona.status))).sort(),
    [personas]
  );
  const filteredPersonas = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return personas.filter((persona) => {
      const matchesStatus = statusFilter === "ALL" || persona.status === statusFilter;
      const searchableText = `${persona.name} ${persona.description} ${persona.behaviorNotes}`.toLowerCase();

      return matchesStatus && (!normalizedSearch || searchableText.includes(normalizedSearch));
    });
  }, [personas, searchTerm, statusFilter]);
  const personaRows = useMemo<PersonaTableRow[]>(
    () =>
      filteredPersonas.map((persona) => ({
        personaId: persona.personaId,
        name: persona.name,
        description: persona.description || "No description yet.",
        behaviorNotes: persona.behaviorNotes || "No behavior notes yet.",
        status: persona.status,
        updatedAt: timestampForSort(persona.updatedAt),
        updatedLabel: formatShortDate(persona.updatedAt),
        actions: "",
        persona
      })),
    [filteredPersonas]
  );
  const personaColumns = useMemo<DataTableColumn<PersonaTableRow>[]>(
    () => [
      {
        key: "name",
        header: "Persona",
        sortable: true,
        width: "22%",
        render: (_value, row) => (
          <div className="scenario-name-cell">
            <strong>{row.name}</strong>
          </div>
        )
      },
      {
        key: "status",
        header: "Status",
        sortable: true,
        width: "12%",
        render: (value) => (
          <span className={`status-badge ${value === "ACTIVE" ? "status-published" : "status-draft"}`}>
            {String(value)}
          </span>
        )
      },
      {
        key: "description",
        header: "Description",
        sortable: true,
        width: "26%",
        render: (value) => <p className="persona-table-text">{String(value)}</p>
      },
      {
        key: "behaviorNotes",
        header: "Behavior notes",
        sortable: true,
        width: "27%",
        render: (value) => <p className="persona-table-text">{String(value)}</p>
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
            aria-label={`Edit ${row.name}`}
            onClick={(event) => {
              event.stopPropagation();
              startEdit(row.persona);
            }}
          >
            <Edit3 aria-hidden="true" size={16} />
          </button>
        )
      }
    ],
    []
  );

  const createMutation = useMutation({
    mutationFn: createPersona,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["personas"] });
      closePersonaModal();
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ personaId, payload }: { personaId: string; payload: PersonaFormPayload }) =>
      updatePersona(personaId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["personas"] });
      closePersonaModal();
    }
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  useEffect(() => {
    if (!isPersonaModalOpen) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSaving) {
        closePersonaModal();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPersonaModalOpen, isSaving]);

  function startCreate() {
    setError("");
    setEditingPersonaId("");
    setForm(emptyForm);
    setPersonaModalOpen(true);
  }

  function startEdit(persona: Persona) {
    setError("");
    setEditingPersonaId(persona.personaId);
    setForm({
      name: persona.name,
      description: persona.description,
      behaviorNotes: persona.behaviorNotes
    });
    setPersonaModalOpen(true);
  }

  function closePersonaModal() {
    setPersonaModalOpen(false);
    setEditingPersonaId("");
    setForm(emptyForm);
    setError("");
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
    <section className="builder-layout scenario-workbench">
      <div className="section-title-row">
        <div>
          <span className="eyebrow">Manager library</span>
          <h2>Personas</h2>
        </div>
        <div className="scenario-summary-strip" aria-label="Persona summary">
          <span>
            <strong>{activeCount}</strong>
            Active
          </span>
          <span>
            <strong>{personas.length - activeCount}</strong>
            Other
          </span>
          <span>
            <strong>{personas.length}</strong>
            Total
          </span>
        </div>
      </div>

      <div className="scenario-command-bar">
        <label className="scenario-search-control">
          <Search aria-hidden="true" size={18} />
          <span className="visually-hidden">Search personas</span>
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search persona, description, or behavior"
          />
        </label>

        <div className="scenario-filter-group" aria-label="Persona filters">
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
        </div>

        <button type="button" className="primary-button scenario-add-button" onClick={startCreate}>
          <Plus aria-hidden="true" size={18} />
          Add persona
        </button>
      </div>

      {error && !isPersonaModalOpen ? <p className="form-error">{error}</p> : null}

      <DataTable
        className="scenario-data-table"
        compact
        columns={personaColumns}
        data={personaRows}
        emptyMessage={
          personas.length ? "No personas match current filters." : "Create first persona before building scenarios."
        }
        getRowClassName={(row) => (row.personaId === editingPersonaId ? "selected" : "")}
        itemsPerPage={10}
        loading={isLoading}
        onRowClick={(row) => startEdit(row.persona)}
        searchable={false}
        striped
      />

      {isPersonaModalOpen ? createPortal(
        <div className="modal-backdrop" onMouseDown={closePersonaModal}>
          <form
            aria-labelledby="persona-modal-title"
            aria-modal="true"
            className="scenario-form scenario-modal"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={handleSubmit}
            role="dialog"
          >
            <div className="modal-title-row">
              <div className="panel-heading">
                <UserPlus aria-hidden="true" size={20} />
                <div>
                  <h3 id="persona-modal-title">{editingPersonaId ? "Edit persona" : "Create persona"}</h3>
                  <p>Reusable customer behavior for future issue generation.</p>
                </div>
              </div>
              <button
                aria-label="Close persona form"
                className="icon-button"
                disabled={isSaving}
                type="button"
                onClick={closePersonaModal}
              >
                <X aria-hidden="true" size={18} />
              </button>
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
                placeholder="Direct, time-sensitive, expects ownership and clear next step."
              />
            </label>

            {error ? <p className="form-error">{error}</p> : null}

            <div className="button-row">
              <button type="button" className="secondary-button" disabled={isSaving} onClick={closePersonaModal}>
                Cancel
              </button>
              <button type="submit" className="primary-button" disabled={isSaving}>
                <Save aria-hidden="true" size={18} />
                {isSaving ? "Saving..." : "Save persona"}
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
