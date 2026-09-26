"use client";

import { useEffect, useState } from "react";
import Shell from "../../components/Shell";
import { api, errorMessage } from "../../lib/api";
import { EmptyState, ErrorAlert, SkeletonRows } from "../../components/ui/States";

interface Log {
  id: string;
  action: string;
  resource: string;
  resourceId: string;
  newValues: string | null;
  createdAt: string;
  user: { firstName: string; lastName: string; role: string } | null;
}

const RESOURCES = ["", "Payslip", "Invoice", "Grade", "User", "StaffMember", "Student", "AI", "SchoolSettings", "Document", "Timetable", "AcademicYear"];

export default function AuditPage() {
  const [logs, setLogs] = useState<Log[] | null>(null);
  const [resource, setResource] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLogs(null);
    api
      .get<Log[]>(`/school/audit-logs${resource ? `?resource=${resource}` : ""}`)
      .then(setLogs)
      .catch((err) => setError(errorMessage(err)));
  }, [resource]);

  return (
    <Shell title="Journal d'audit">
      <div className="page-header">
        <div>
          <h1>Journal d&apos;audit</h1>
          <p>Traçabilité des actions sensibles : paie, paiements, notes, comptes, actions de l&apos;assistant, paramètres.</p>
        </div>
        <div className="field" style={{ marginBottom: 0, minWidth: 220 }}>
          <label htmlFor="audit-res">Filtrer</label>
          <select id="audit-res" className="input" value={resource} onChange={(e) => setResource(e.target.value)}>
            {RESOURCES.map((r) => (
              <option key={r} value={r}>
                {r || "Toutes les ressources"}
              </option>
            ))}
          </select>
        </div>
      </div>
      <ErrorAlert message={error} />
      {!logs ? (
        <SkeletonRows />
      ) : logs.length === 0 ? (
        <EmptyState title="Aucune entrée" />
      ) : (
        <div className="table-wrap responsive">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Utilisateur</th>
                <th>Action</th>
                <th>Ressource</th>
                <th>Détail</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td data-label="Date">{new Date(l.createdAt).toLocaleString("fr-FR")}</td>
                  <td data-label="Utilisateur">{l.user ? `${l.user.firstName} ${l.user.lastName} (${l.user.role})` : "Système"}</td>
                  <td data-label="Action">
                    <span className="badge badge-neutral">{l.action}</span>
                  </td>
                  <td data-label="Ressource">{l.resource}</td>
                  <td data-label="Détail" style={{ maxWidth: 360, overflowWrap: "anywhere", fontSize: 12.5 }} className="muted">
                    {l.newValues ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
