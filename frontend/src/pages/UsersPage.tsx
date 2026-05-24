import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit3, Save, Search, SlidersHorizontal, X } from "lucide-react";
import { fetchUsers, getApiErrorMessage, updateUserProfile } from "../api/client";
import type { EditableUserStatus, UserProfile, UserRole, UserUpdatePayload } from "../api/client";
import { DataTable } from "../components/ui/basic-data-table";
import type { DataTableColumn } from "../components/ui/basic-data-table";

type UserTableRow = {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
  createdAt: number;
  createdLabel: string;
  updatedAt: number;
  updatedLabel: string;
  actions: string;
  user: UserProfile;
};

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: fetchUsers
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [userForm, setUserForm] = useState<UserUpdatePayload>({ role: "rep", status: "ACTIVE" });
  const [error, setError] = useState("");

  const managerCount = useMemo(
    () => users.filter((user) => user.role === "manager").length,
    [users]
  );
  const activeCount = useMemo(
    () => users.filter((user) => user.status === "ACTIVE").length,
    [users]
  );
  const availableRoles = useMemo(
    () => Array.from(new Set(users.map((user) => user.role))).sort(),
    [users]
  );
  const availableStatuses = useMemo(
    () => Array.from(new Set(users.map((user) => user.status))).sort(),
    [users]
  );
  const filteredUsers = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return users.filter((user) => {
      const matchesRole = roleFilter === "ALL" || user.role === roleFilter;
      const matchesStatus = statusFilter === "ALL" || user.status === statusFilter;
      const searchableText = `${user.fullName} ${user.email} ${user.userId}`.toLowerCase();

      return matchesRole && matchesStatus && (!normalizedSearch || searchableText.includes(normalizedSearch));
    });
  }, [roleFilter, searchTerm, statusFilter, users]);
  const userRows = useMemo<UserTableRow[]>(
    () =>
      filteredUsers.map((user) => ({
        userId: user.userId,
        fullName: user.fullName || "Unnamed user",
        email: user.email,
        role: user.role,
        status: user.status,
        createdAt: timestampForSort(user.createdAt),
        createdLabel: formatShortDate(user.createdAt),
        updatedAt: timestampForSort(user.updatedAt),
        updatedLabel: formatShortDate(user.updatedAt),
        actions: "",
        user
      })),
    [filteredUsers]
  );
  const updateMutation = useMutation({
    mutationFn: ({ userId, payload }: { userId: string; payload: UserUpdatePayload }) =>
      updateUserProfile(userId, payload),
    onSuccess: async () => {
      setEditingUser(null);
      setError("");
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    }
  });
  const userColumns = useMemo<DataTableColumn<UserTableRow>[]>(
    () => [
      {
        key: "fullName",
        header: "User",
        sortable: true,
        width: "24%",
        render: (_value, row) => (
          <div className="scenario-name-cell">
            <strong>{row.fullName}</strong>
            <span>{row.email || "No email"}</span>
          </div>
        )
      },
      {
        key: "role",
        header: "Role",
        sortable: true,
        width: "13%",
        render: (value) => <span className="status-badge">{String(value)}</span>
      },
      {
        key: "status",
        header: "Status",
        sortable: true,
        width: "18%",
        render: (value) => (
          <span className={`status-badge ${value === "ACTIVE" ? "status-published" : "status-draft"}`}>
            {String(value)}
          </span>
        )
      },
      {
        key: "userId",
        header: "User ID",
        sortable: true,
        width: "21%",
        render: (value) => <code className="table-code">{String(value)}</code>
      },
      {
        key: "createdAt",
        header: "Created",
        sortable: true,
        width: "12%",
        render: (_value, row) => <span>{row.createdLabel}</span>
      },
      {
        key: "updatedAt",
        header: "Updated",
        sortable: true,
        width: "12%",
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
            aria-label={`Edit ${row.fullName}`}
            onClick={(event) => {
              event.stopPropagation();
              startEdit(row.user);
            }}
          >
            <Edit3 aria-hidden="true" size={16} />
          </button>
        )
      }
    ],
    []
  );

  function startEdit(user: UserProfile) {
    setError("");
    setEditingUser(user);
    setUserForm({
      role: user.role,
      status: user.status === "SUSPENDED" ? "SUSPENDED" : "ACTIVE"
    });
  }

  function closeUserModal() {
    setEditingUser(null);
    setError("");
  }

  async function handleSaveUser() {
    if (!editingUser) {
      return;
    }

    setError("");

    try {
      await updateMutation.mutateAsync({
        userId: editingUser.userId,
        payload: userForm
      });
    } catch (err) {
      setError(getApiErrorMessage(err, "User update failed."));
    }
  }

  return (
    <section className="builder-layout scenario-workbench">
      <div className="section-title-row">
        <div>
          <span className="eyebrow">Manager access</span>
          <h2>Users</h2>
        </div>
        <div className="scenario-summary-strip" aria-label="Users summary">
          <span>
            <strong>{activeCount}</strong>
            Active
          </span>
          <span>
            <strong>{managerCount}</strong>
            Managers
          </span>
          <span>
            <strong>{users.length}</strong>
            Total
          </span>
        </div>
      </div>

      <div className="scenario-command-bar users-command-bar">
        <label className="scenario-search-control">
          <Search aria-hidden="true" size={18} />
          <span className="visually-hidden">Search users</span>
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search name, email, or user ID"
          />
        </label>

        <div className="scenario-filter-group" aria-label="User filters">
          <SlidersHorizontal aria-hidden="true" size={18} />
          <label>
            <span>Role</span>
            <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
              <option value="ALL">All roles</option>
              {availableRoles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>
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
      </div>

      {error && !editingUser ? <p className="form-error">{error}</p> : null}

      <DataTable
        className="scenario-data-table"
        compact
        columns={userColumns}
        data={userRows}
        emptyMessage={users.length ? "No users match current filters." : "No user profiles found."}
        itemsPerPage={10}
        loading={isLoading}
        searchable={false}
        striped
      />

      {editingUser ? createPortal(
        <div className="modal-backdrop" onMouseDown={closeUserModal}>
          <section
            aria-labelledby="user-modal-title"
            aria-modal="true"
            className="scenario-form scenario-modal"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="modal-title-row">
              <div className="panel-heading">
                <Save aria-hidden="true" size={20} />
                <div>
                  <h3 id="user-modal-title">Edit user access</h3>
                  <p>{editingUser.email}</p>
                </div>
              </div>
              <button
                aria-label="Close user form"
                className="icon-button"
                disabled={updateMutation.isPending}
                type="button"
                onClick={closeUserModal}
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>

            <div className="form-row">
              <label>
                Role
                <select
                  value={userForm.role}
                  onChange={(event) =>
                    setUserForm((current) => ({
                      ...current,
                      role: event.target.value as UserRole
                    }))
                  }
                  disabled={editingUser.status === "PENDING_CONFIRMATION" || updateMutation.isPending}
                >
                  <option value="rep">Rep</option>
                  <option value="manager">Manager</option>
                </select>
              </label>

              <label>
                Status
                <select
                  value={userForm.status}
                  onChange={(event) =>
                    setUserForm((current) => ({
                      ...current,
                      status: event.target.value as EditableUserStatus
                    }))
                  }
                  disabled={editingUser.status === "PENDING_CONFIRMATION" || updateMutation.isPending}
                >
                  <option value="ACTIVE">Active</option>
                  <option value="SUSPENDED">Suspended</option>
                </select>
                {editingUser.status === "PENDING_CONFIRMATION" ? (
                  <span className="field-help">Pending users must confirm email before access can change.</span>
                ) : null}
              </label>
            </div>

            {error ? <p className="form-error">{error}</p> : null}

            <div className="button-row">
              <button
                type="button"
                className="secondary-button"
                disabled={updateMutation.isPending}
                onClick={closeUserModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={editingUser.status === "PENDING_CONFIRMATION" || updateMutation.isPending}
                onClick={handleSaveUser}
              >
                <Save aria-hidden="true" size={18} />
                {updateMutation.isPending ? "Saving..." : "Save access"}
              </button>
            </div>
          </section>
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
