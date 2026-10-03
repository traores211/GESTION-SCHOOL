"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, ScrollText } from "lucide-react";
import Shell from "../../components/Shell";
import { EmptyState, PageHeader, Pagination, TableSkeleton } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { ROLE_LABELS } from "../../lib/auth";

interface Entry {
  id: string;
  createdAt: string;
  action: string;
  resource: string;
  area: string;
  resourceId: string;
  user: { id: string; name: string; role: string; email: string } | null;
  ipAddress: string | null;
  userAgent: string | null;
  oldValues: unknown;
  newValues: { result?: string; body?: unknown } | Record<string, unknown> | null;
}

const ACTIONS: Record<string, { label: string; tone: string }> = {
  CREATE: { label: "Création", tone: "badge-green" },
  UPDATE: { label: "Modification", tone: "badge-info" },
  DELETE: { label: "Suppression", tone: "badge-danger" },
  DENIED: { label: "Accès refusé", tone: "badge-danger" },
  LOGIN: { label: "Connexion", tone: "badge-neutral" },
  LOGIN_FAILED: { label: "Échec de connexion", tone: "badge-warning" },
};

function Json({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="muted">—</span>;
  return <pre className="audit-json">{JSON.stringify(value, null, 2)}</pre>;
}

function AuditContent() {
  const [filters, setFilters] = useState({ area: "", action: "", userId: "", from: "", to: "", q: "" });
  const [options, setOptions] = useState<{ areas: Record<string, string>; users: { id: string; name: string }[] } | null>(null);
  const [data, setData] = useState<{ total: number; page: number; pageSize: number; items: Entry[] } | null>(null);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<typeof options>("/audit/filters").then(setOptions).catch(() => setOptions({ areas: {}, users: [] }));
  }, []);

  const load = useCallback(() => {
    const q = new URLSearchParams({ page: String(page), pageSize: "50" });
    for (const [k, v] of Object.entries(filters)) if (v) q.set(k, v);
    api
      .get<NonNullable<typeof data>>(`/audit?${q}`)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [filters, page]);
  useEffect(load, [load]);

  const set = (patch: Partial<typeof filters>) => {
    setFilters({ ...filters, ...patch });
    setPage(1);
  };

  return (
    <>
      <PageHeader title="Journal d'audit" description="Toutes les modifications faites dans l'établissement : qui, quoi, quand, depuis où, avec l'état avant modification. Les mots de passe et codes ne sont jamais enregistrés." />
      <div className="table-toolbar audit-filters">
        <select className="input" aria-label="Domaine" value={filters.area} onChange={(e) => set({ area: e.target.value })}>
          <option value="">Tous les domaines</option>
          {Object.entries(options?.areas ?? {}).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select className="input" aria-label="Action" value={filters.action} onChange={(e) => set({ action: e.target.value })}>
          <option value="">Toutes les actions</option>
          {Object.entries(ACTIONS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <select className="input" aria-label="Utilisateur" value={filters.userId} onChange={(e) => set({ userId: e.target.value })}>
          <option value="">Tous les utilisateurs</option>
          {options?.users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <input type="date" className="input" aria-label="Du" value={filters.from} onChange={(e) => set({ from: e.target.value })} />
        <input type="date" className="input" aria-label="Au" value={filters.to} onChange={(e) => set({ to: e.target.value })} />
        <input className="input" placeholder="Rechercher (nom, montant, matricule…)" aria-label="Rechercher" value={filters.q} onChange={(e) => set({ q: e.target.value })} />
      </div>

      <div className="table-wrap">
        {error ? (
          <EmptyState tone="error" title="Journal indisponible">
            {error}
          </EmptyState>
        ) : !data ? (
          <TableSkeleton columns={5} rows={8} />
        ) : data.items.length === 0 ? (
          <EmptyState icon={<ScrollText size={22} />} title="Aucune entrée">
            Aucune action ne correspond à ces filtres.
          </EmptyState>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Utilisateur</th>
                  <th>Action</th>
                  <th>Élément</th>
                  <th>Résultat</th>
                  <th className="actions">
                    <span className="visually-hidden">Détail</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((e) => {
                  const a = ACTIONS[e.action] ?? { label: e.action, tone: "badge-neutral" };
                  const result = (e.newValues as { result?: string } | null)?.result;
                  const expanded = open === e.id;
                  return (
                    <Fragment key={e.id}>
                      <tr>
                        <td className="nowrap">{new Date(e.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "medium" })}</td>
                        <td>
                          {e.user ? (
                            <>
                              <div className="cell-main">{e.user.name}</div>
                              <div className="cell-sub">{ROLE_LABELS[e.user.role] ?? e.user.role}</div>
                            </>
                          ) : (
                            <span className="muted">{(e.newValues as { email?: string } | null)?.email ?? "Inconnu"}</span>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${a.tone}`}>{a.label}</span>
                        </td>
                        <td>
                          <div className="cell-main">{e.area}</div>
                          <div className="cell-sub tabular">{e.resource}</div>
                        </td>
                        <td className="nowrap">{result ? <span className={result === "OK" ? "status-ok" : "status-ko"}>{result}</span> : "—"}</td>
                        <td className="actions">
                          <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-expanded={expanded} aria-label="Voir le détail" onClick={() => setOpen(expanded ? null : e.id)}>
                            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                        </td>
                      </tr>
                      {expanded && (
                        <tr>
                          <td colSpan={6} style={{ background: "var(--paper-sunken)" }}>
                            <div className="audit-detail">
                              <div>
                                <strong>Avant</strong>
                                <Json value={e.oldValues} />
                              </div>
                              <div>
                                <strong>Données envoyées</strong>
                                <Json value={(e.newValues as { body?: unknown } | null)?.body ?? e.newValues} />
                              </div>
                            </div>
                            <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>
                              Identifiant : {e.resourceId} · IP : {e.ipAddress ?? "—"} · {e.userAgent ?? ""}
                            </p>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            <Pagination page={data.page} pageCount={Math.max(1, Math.ceil(data.total / data.pageSize))} total={data.total} pageSize={data.pageSize} onPage={setPage} unit="entrée" />
          </>
        )}
      </div>
    </>
  );
}

export default function AuditPage() {
  return (
    <Shell title="Journal d'audit">
      <AuditContent />
    </Shell>
  );
}
