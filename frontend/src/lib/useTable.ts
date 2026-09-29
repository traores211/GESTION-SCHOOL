import { useEffect, useMemo, useState } from "react";

export interface SortState<K extends string> {
  key: K | null;
  dir: "asc" | "desc";
}

const collator = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

/** Accent- and case-insensitive text comparison key. */
export function searchKey(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined || a === "") return 1;
  if (b === null || b === undefined || b === "") return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return collator.compare(String(a), String(b));
}

/**
 * Client-side search + sort + pagination for lists that are already loaded.
 * `accessors` maps each sortable column to the value to compare; `searchText` builds the searchable text.
 */
export function useTable<T, K extends string>({
  rows,
  accessors,
  searchText,
  initialSort = { key: null, dir: "asc" },
  pageSize = 20,
}: {
  rows: T[];
  accessors: Record<K, (row: T) => unknown>;
  searchText?: (row: T) => string;
  initialSort?: SortState<K>;
  pageSize?: number;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState<K>>(initialSort);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = searchKey(query.trim());
    if (!q || !searchText) return rows;
    const terms = q.split(/\s+/);
    return rows.filter((row) => {
      const text = searchKey(searchText(row));
      return terms.every((t) => text.includes(t));
    });
  }, [rows, query, searchText]);

  const sorted = useMemo(() => {
    if (!sort.key) return filtered;
    const get = accessors[sort.key];
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => factor * compareValues(get(a), get(b)));
    // accessors are static per page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sort]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  useEffect(() => setPage(1), [query, sort]);
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const pageRows = useMemo(() => sorted.slice((page - 1) * pageSize, page * pageSize), [sorted, page, pageSize]);

  const toggleSort = (key: K) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  return { query, setQuery, sort, toggleSort, page, setPage, pageCount, pageRows, total: sorted.length, pageSize };
}
