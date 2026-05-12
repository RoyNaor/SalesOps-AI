import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, SlidersHorizontal } from "lucide-react";
import { fetchUsers } from "../api/client";
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
};

export default function UsersPage() {
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: fetchUsers
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

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
        updatedLabel: formatShortDate(user.updatedAt)
      })),
    [filteredUsers]
  );
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
      }
    ],
    []
  );

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
