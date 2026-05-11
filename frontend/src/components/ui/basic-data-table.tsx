import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, ChevronUp, Filter, Search, X } from "lucide-react";
import { cn } from "../../lib/utils";

export type DataTableColumn<T> = {
  key: keyof T;
  header: string;
  sortable?: boolean;
  filterable?: boolean;
  render?: (value: T[keyof T], row: T) => ReactNode;
  width?: string;
};

export type DataTableProps<T> = {
  data: T[];
  columns: DataTableColumn<T>[];
  className?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  itemsPerPage?: number;
  showPagination?: boolean;
  striped?: boolean;
  hoverable?: boolean;
  bordered?: boolean;
  compact?: boolean;
  loading?: boolean;
  emptyMessage?: string;
  getRowClassName?: (row: T, index: number) => string;
  onRowClick?: (row: T, index: number) => void;
};

export function DataTable<T extends object>({
  data,
  columns,
  className,
  searchable = true,
  searchPlaceholder = "Search...",
  itemsPerPage = 10,
  showPagination = true,
  striped = false,
  hoverable = true,
  bordered = true,
  compact = false,
  loading = false,
  emptyMessage = "No data available",
  getRowClassName,
  onRowClick
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");
  const [sortConfig, setSortConfig] = useState<{
    key: keyof T | null;
    direction: "asc" | "desc";
  }>({ key: null, direction: "asc" });
  const [currentPage, setCurrentPage] = useState(1);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});

  const filteredData = useMemo(() => {
    let filtered = [...data];

    if (search) {
      const normalizedSearch = search.toLowerCase();
      filtered = filtered.filter((row) =>
        columns.some((column) => String(row[column.key] ?? "").toLowerCase().includes(normalizedSearch))
      );
    }

    Object.entries(columnFilters).forEach(([key, value]) => {
      if (!value) {
        return;
      }

      filtered = filtered.filter((row) =>
        String(row[key as keyof T] ?? "")
          .toLowerCase()
          .includes(value.toLowerCase())
      );
    });

    return filtered;
  }, [columnFilters, columns, data, search]);

  const sortedData = useMemo(() => {
    if (!sortConfig.key) {
      return filteredData;
    }

    return [...filteredData].sort((a, b) => {
      const aValue = a[sortConfig.key!];
      const bValue = b[sortConfig.key!];

      if (aValue === bValue) {
        return 0;
      }

      if (aValue == null) {
        return sortConfig.direction === "asc" ? -1 : 1;
      }

      if (bValue == null) {
        return sortConfig.direction === "asc" ? 1 : -1;
      }

      const normalizedA = normalizeComparable(aValue);
      const normalizedB = normalizeComparable(bValue);

      return normalizedA < normalizedB
        ? sortConfig.direction === "asc"
          ? -1
          : 1
        : sortConfig.direction === "asc"
          ? 1
          : -1;
    });
  }, [filteredData, sortConfig]);

  const paginatedData = useMemo(() => {
    if (!showPagination) {
      return sortedData;
    }

    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedData.slice(startIndex, startIndex + itemsPerPage);
  }, [currentPage, itemsPerPage, showPagination, sortedData]);

  const totalPages = Math.ceil(sortedData.length / itemsPerPage);
  const firstResult = sortedData.length ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const lastResult = Math.min(currentPage * itemsPerPage, sortedData.length);

  function handleSort(key: keyof T) {
    setSortConfig((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc"
    }));
  }

  function handleColumnFilter(key: string, value: string) {
    setColumnFilters((current) => ({
      ...current,
      [key]: value
    }));
    setCurrentPage(1);
  }

  function clearColumnFilter(key: string) {
    setColumnFilters((current) => {
      const nextFilters = { ...current };
      delete nextFilters[key];
      return nextFilters;
    });
  }

  if (loading) {
    return (
      <div className={cn("data-table-shell is-loading", bordered && "is-bordered", className)}>
        {searchable ? <div className="data-table-skeleton data-table-skeleton-search" /> : null}
        <div className="data-table-skeleton-grid">
          <div className="data-table-skeleton data-table-skeleton-head" />
          {Array.from({ length: 5 }).map((_, index) => (
            <div className="data-table-skeleton data-table-skeleton-row" key={index} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("data-table-shell", bordered && "is-bordered", className)}>
      {searchable ? (
        <div className="data-table-search-row">
          <label className="data-table-search">
            <Search aria-hidden="true" size={16} />
            <span className="visually-hidden">Search table</span>
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setCurrentPage(1);
              }}
              placeholder={searchPlaceholder}
              type="text"
            />
          </label>
        </div>
      ) : null}

      <div className="data-table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={String(column.key)}
                  onClick={() => column.sortable && handleSort(column.key)}
                  style={column.width ? { width: column.width } : undefined}
                >
                  <div className={cn("data-table-header", column.sortable && "is-sortable")}>
                    <span>{column.header}</span>
                    {column.sortable ? (
                      <span className="data-table-sort-icons" aria-hidden="true">
                        <ChevronUp
                          size={13}
                          className={sortConfig.key === column.key && sortConfig.direction === "asc" ? "active" : ""}
                        />
                        <ChevronDown
                          size={13}
                          className={sortConfig.key === column.key && sortConfig.direction === "desc" ? "active" : ""}
                        />
                      </span>
                    ) : null}
                    {column.filterable ? <Filter aria-hidden="true" size={13} /> : null}
                  </div>

                  {column.filterable ? (
                    <div className="data-table-column-filter">
                      <input
                        value={columnFilters[String(column.key)] || ""}
                        onChange={(event) => handleColumnFilter(String(column.key), event.target.value)}
                        onClick={(event) => event.stopPropagation()}
                        placeholder="Filter..."
                        type="text"
                      />
                      {columnFilters[String(column.key)] ? (
                        <button
                          aria-label={`Clear ${column.header} filter`}
                          onClick={(event) => {
                            event.stopPropagation();
                            clearColumnFilter(String(column.key));
                          }}
                          type="button"
                        >
                          <X aria-hidden="true" size={12} />
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedData.length ? (
              paginatedData.map((row, index) => (
                <tr
                  className={cn(
                    striped && index % 2 === 0 && "is-striped",
                    hoverable && "is-hoverable",
                    onRowClick && "is-clickable",
                    getRowClassName?.(row, index)
                  )}
                  key={index}
                  onClick={() => onRowClick?.(row, index)}
                >
                  {columns.map((column) => (
                    <td data-label={column.header} key={String(column.key)} className={compact ? "is-compact" : ""}>
                      {column.render ? column.render(row[column.key], row) : String(row[column.key] ?? "")}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td className="data-table-empty" colSpan={columns.length}>
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showPagination && totalPages > 1 ? (
        <div className="data-table-pagination">
          <span>
            Showing {firstResult} to {lastResult} of {sortedData.length} results
          </span>
          <div className="data-table-page-actions">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((current) => Math.max(current - 1, 1))}
              type="button"
            >
              Previous
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }).map((_, index) => {
              const pageNumber =
                currentPage <= 3
                  ? index + 1
                  : currentPage >= totalPages - 2
                    ? totalPages - 4 + index
                    : currentPage - 2 + index;

              if (pageNumber < 1 || pageNumber > totalPages) {
                return null;
              }

              return (
                <button
                  className={currentPage === pageNumber ? "active" : ""}
                  key={pageNumber}
                  onClick={() => setCurrentPage(pageNumber)}
                  type="button"
                >
                  {pageNumber}
                </button>
              );
            })}
            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((current) => Math.min(current + 1, totalPages))}
              type="button"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function normalizeComparable(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  return String(value).toLowerCase();
}
