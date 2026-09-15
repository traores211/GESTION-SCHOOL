"use client";

import { useEffect, useState } from "react";
import Shell from "../../components/Shell";
import { api, ApiError } from "../../lib/api";
import { getToken } from "../../lib/auth";

interface Payslip {
  id: string;
  period: string;
  baseSalary: number;
  bonuses: number;
  deductions: number;
  netSalary: number;
  status: "DRAFT" | "VALIDATED" | "PAID";
  staffMember: { position: string; user: { firstName: string; lastName: string } };
}

interface StaffRow {
  id: string;
  firstName: string;
  lastName: string;
  staffMember: { id: string; position: string; baseSalary: number | null } | null;
}

function formatFCFA(amount: number) {
  return new Intl.NumberFormat("fr-FR").format(Math.round(amount)) + " FCFA";
}

function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function PayrollPage() {
  const [period, setPeriod] = useState(currentPeriod());
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState<Payslip | null>(null);
  const [salaryForm, setSalaryForm] = useState({ staffId: "", baseSalary: 150000 });

  const load = () => {
    api.get<Payslip[]>(`/payroll?period=${period}`).then(setPayslips).catch((err) => setError(err instanceof ApiError ? err.message : "Erreur"));
  };

  useEffect(load, [period]);
  useEffect(() => {
    api.get<StaffRow[]>("/staff").then(setStaff).catch(() => {});
  }, []);

  const generate = async () => {
    setGenerating(true);
    setError(null);
    setMessage(null);
    try {
      const created = await api.post<Payslip[]>("/payroll/generate", { period });
      setMessage(`${created.length} bulletin(s) généré(s) pour ${period}.`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de la génération");
    } finally {
      setGenerating(false);
    }
  };

  const setStaffSalary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!salaryForm.staffId) return;
    await api.patch(`/staff/${salaryForm.staffId}/salary`, { baseSalary: salaryForm.baseSalary });
    api.get<StaffRow[]>("/staff").then(setStaff);
    setMessage("Salaire de base mis à jour.");
  };

  const saveAdjustments = async (id: string, bonuses: number, deductions: number) => {
    await api.patch(`/payroll/${id}`, { bonuses, deductions });
    setEditing(null);
    load();
  };

  const validate = async (id: string) => {
    await api.patch(`/payroll/${id}/validate`);
    load();
  };

  const pay = async (id: string) => {
    await api.patch(`/payroll/${id}/pay`);
    load();
  };

  const downloadPdf = (id: string) => {
    const token = getToken();
    fetch(api.fileUrl(`/payroll/${id}/pdf`), { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.blob())
      .then((blob) => {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "bulletin-paie.pdf";
        link.click();
      });
  };

  const totalNet = payslips.reduce((s, p) => s + p.netSalary, 0);

  return (
    <Shell title="Paie du personnel">
      <div className="page-header">
        <div>
          <h1>💵 Paie du personnel</h1>
          <p>Salaires, primes, retenues et bulletins de paie</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Période</label>
          <input type="month" className="input" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={generate} disabled={generating}>
          {generating ? "Génération…" : "⚙️ Générer les bulletins"}
        </button>
        <div className="kpi-card" style={{ marginBottom: 0 }}>
          <div className="kpi-label">Masse salariale nette ({period})</div>
          <div className="kpi-value" style={{ fontSize: 18 }}>{formatFCFA(totalNet)}</div>
        </div>
      </div>

      {message && <p className="text-green" style={{ marginBottom: 12 }}>{message}</p>}
      {error && <p className="text-danger" style={{ marginBottom: 12 }}>{error}</p>}

      <div className="table-wrap" style={{ marginBottom: 24 }}>
        <table>
          <thead>
            <tr>
              <th>Employé</th>
              <th>Poste</th>
              <th>Base</th>
              <th>Primes</th>
              <th>Retenues</th>
              <th>Net</th>
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {payslips.map((p) => (
              <tr key={p.id}>
                <td>{p.staffMember.user.lastName} {p.staffMember.user.firstName}</td>
                <td>{p.staffMember.position}</td>
                <td>{formatFCFA(p.baseSalary)}</td>
                <td>{formatFCFA(p.bonuses)}</td>
                <td>{formatFCFA(p.deductions)}</td>
                <td><strong>{formatFCFA(p.netSalary)}</strong></td>
                <td>
                  <span className={`badge ${p.status === "PAID" ? "badge-green" : p.status === "VALIDATED" ? "badge-info" : "badge-neutral"}`}>
                    {p.status}
                  </span>
                </td>
                <td style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {p.status !== "PAID" && (
                    <button className="btn btn-outline btn-sm" onClick={() => setEditing(p)}>Ajuster</button>
                  )}
                  {p.status === "DRAFT" && (
                    <button className="btn btn-outline btn-sm" onClick={() => validate(p.id)}>Valider</button>
                  )}
                  {p.status === "VALIDATED" && (
                    <button className="btn btn-secondary btn-sm" onClick={() => pay(p.id)}>Payer</button>
                  )}
                  <button className="btn btn-outline btn-sm" onClick={() => downloadPdf(p.id)}>📄</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {payslips.length === 0 && <div className="empty-state">Aucun bulletin pour cette période. Cliquez sur &quot;Générer les bulletins&quot;.</div>}
      </div>

      <div className="card">
        <h2 style={{ fontSize: 14, marginBottom: 12 }}>Définir le salaire de base</h2>
        <form onSubmit={setStaffSalary} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="field" style={{ marginBottom: 0, minWidth: 220 }}>
            <label>Employé</label>
            <select className="input" value={salaryForm.staffId} onChange={(e) => setSalaryForm({ ...salaryForm, staffId: e.target.value })}>
              <option value="">— Sélectionner —</option>
              {staff.filter((s) => s.staffMember).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.lastName} {s.firstName} {s.staffMember?.baseSalary ? `(${formatFCFA(s.staffMember.baseSalary)})` : "(non défini)"}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Salaire de base (FCFA)</label>
            <input type="number" className="input" value={salaryForm.baseSalary} onChange={(e) => setSalaryForm({ ...salaryForm, baseSalary: Number(e.target.value) })} />
          </div>
          <button type="submit" className="btn btn-secondary" disabled={!salaryForm.staffId}>Enregistrer</button>
        </form>
      </div>

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 17, marginBottom: 4 }}>Ajuster le bulletin</h2>
            <p className="muted" style={{ marginBottom: 16, fontSize: 13 }}>
              {editing.staffMember.user.firstName} {editing.staffMember.user.lastName} — {editing.period}
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const bonuses = Number((form.elements.namedItem("bonuses") as HTMLInputElement).value);
                const deductions = Number((form.elements.namedItem("deductions") as HTMLInputElement).value);
                saveAdjustments(editing.id, bonuses, deductions);
              }}
            >
              <div className="form-grid">
                <div className="field">
                  <label>Primes (FCFA)</label>
                  <input name="bonuses" type="number" className="input" defaultValue={editing.bonuses} />
                </div>
                <div className="field">
                  <label>Retenues (FCFA)</label>
                  <input name="deductions" type="number" className="input" defaultValue={editing.deductions} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                <button type="button" className="btn btn-outline" onClick={() => setEditing(null)}>Annuler</button>
                <button type="submit" className="btn btn-primary">Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Shell>
  );
}
