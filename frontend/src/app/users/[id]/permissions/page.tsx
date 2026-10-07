"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Shield, ShieldCheck } from "lucide-react";
import Shell from "../../../../components/Shell";
import { EmptyState, PageHeader, TableSkeleton, useFeedback } from "../../../../components/ui";
import { api, errorMessage } from "../../../../lib/api";
import { ROLE_LABELS } from "../../../../lib/auth";

interface PermissionReportItem {
  key: string;
  group: string;
  label: string;
  description: string;
  impliedByRole: boolean;
  granted: boolean;
}

interface PermissionReport {
  user: { id: string; email: string; name: string; role: string };
  items: PermissionReportItem[];
}

const GROUP_LABELS: Record<string, string> = {
  scolarite: "Scolarité",
  "vie-scolaire": "Vie scolaire",
  finances: "Finances",
  communication: "Communication",
  administration: "Administration",
};

function Content({ userId }: { userId: string }) {
  const feedback = useFeedback();
  const router = useRouter();
  const [report, setReport] = useState<PermissionReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(() => {
    api
      .get<PermissionReport>(`/users/${userId}/permissions`)
      .then((r) => {
        setReport(r);
        setSelected(new Set(r.items.filter((i) => i.granted).map((i) => i.key)));
        setDirty(false);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [userId]);

  useEffect(load, [load]);

  const toggle = (key: string) => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/users/${userId}/permissions`, { keys: Array.from(selected) });
      feedback.success("Permissions enregistrées", report?.user.name);
      load();
    } catch (err) {
      feedback.error("Modification impossible", errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const grouped = report
    ? Object.entries(GROUP_LABELS).map(([group, label]) => ({
        group,
        label,
        items: report.items.filter((i) => i.group === group),
      }))
    : [];

  return (
    <>
      <PageHeader
        title={report ? `Permissions — ${report.user.name}` : "Permissions"}
        description={report ? `${ROLE_LABELS[report.user.role] ?? report.user.role} · ${report.user.email}` : "Autorisations fines, en plus de celles accordées par le rôle."}
        breadcrumbs={[{ label: "Personnel", href: "/staff" }, { label: "Permissions" }]}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={() => router.push("/staff")}>
              <ArrowLeft size={14} /> Retour
            </button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={!dirty || saving}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        }
      />

      {error ? (
        <EmptyState tone="error" title="Lecture impossible">
          {error}
        </EmptyState>
      ) : !report ? (
        <TableSkeleton columns={2} rows={8} />
      ) : (
        <div style={{ display: "grid", gap: 18 }}>
          {grouped.map(({ group, label, items }) => (
            <section key={group} className="card" style={{ padding: 16 }}>
              <h2 style={{ margin: "0 0 10px", fontSize: 16 }}>{label}</h2>
              {items.length === 0 ? (
                <EmptyState title="Aucune permission dans ce groupe" />
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
                  {items.map((item) => (
                    <li key={item.key} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <input
                        type="checkbox"
                        id={`perm-${item.key}`}
                        checked={selected.has(item.key) || item.impliedByRole}
                        disabled={item.impliedByRole}
                        onChange={() => toggle(item.key)}
                        style={{ marginTop: 3 }}
                        aria-describedby={`perm-${item.key}-desc`}
                      />
                      <div style={{ flex: 1 }}>
                        <label htmlFor={`perm-${item.key}`} className="cell-main" style={{ cursor: item.impliedByRole ? "default" : "pointer" }}>
                          {item.label}
                          {item.impliedByRole && (
                            <span className="badge badge-green" style={{ marginLeft: 8 }}>
                              <ShieldCheck size={11} style={{ display: "inline", marginRight: 2 }} />
                              Rôle
                            </span>
                          )}
                          {!item.impliedByRole && item.granted && (
                            <span className="badge badge-info" style={{ marginLeft: 8 }}>
                              <Shield size={11} style={{ display: "inline", marginRight: 2 }} />
                              Accordée
                            </span>
                          )}
                        </label>
                        <div id={`perm-${item.key}-desc`} className="cell-sub">
                          {item.description}
                        </div>
                        <div className="cell-sub" style={{ fontFamily: "monospace", fontSize: 11, marginTop: 2 }}>
                          {item.key}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
}

export default function PermissionsPage() {
  const params = useParams<{ id: string }>();
  return (
    <Shell title="Permissions">
      <Content userId={params.id} />
    </Shell>
  );
}
