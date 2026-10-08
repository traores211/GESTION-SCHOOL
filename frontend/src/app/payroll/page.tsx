"use client";

import { useCallback, useEffect, useState } from "react";
import { Banknote, CheckCircle2, FileDown, LoaderCircle, Save, SlidersHorizontal, Wand2 } from "lucide-react";
import Shell from "../../components/Shell";
import { EmptyState, FormError, Modal, PageHeader, Pagination, SearchInput, TableSkeleton, useFeedback } from "../../components/ui";
import { KpiCard } from "../../components/dashboard/ui";
import { api, errorMessage } from "../../lib/api";
import { downloadFile } from "../../lib/download";

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

const STATUS: Record<Payslip["status"], { label: string; badge: string }> = {
  DRAFT: { label: "Brouillon", badge: "badge-neutral" },
  VALIDATED: { label: "Validé", badge: "badge-info" },
  PAID: { label: "Payé", badge: "stamp stamp-olive" },
};

function formatFCFA(amount: number) {
  return new Intl.NumberFormat("fr-FR").format(Math.round(amount)) + " FCFA";
}

function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function periodLabel(period: string) {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

interface PagedPayslips {
  items: Payslip[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

interface PayrollStats {
  totalGross: number;
  totalNet: number;
  count: number;
  paidCount: number;
}

export default function PayrollPage() {
  const feedback = useFeedback();
  const [period, setPeriod] = useState(currentPeriod());
  const [data, setData] = useState<PagedPayslips | null>(null);
  const [stats, setStats] = useState<PayrollStats | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<Payslip | null>(null);
  const [adjust, setAdjust] = useState({ bonuses: 0, deductions: 0 });
  const [formError, setFormError] = useState<string | null>(null);
  const [salaryForm, setSalaryForm] = useState({ staffId: "", baseSalary: 150000 });

  const load = useCallback(() => {
    setData(null);
    const q = new URLSearchParams({ period, page: String(page), pageSize: "25" });
    if (search) q.set("q", search);
    api
      .get<PagedPayslips>(`/payroll?${q.toString()}`)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
    api.get<PayrollStats>(`/payroll/stats?period=${period}`).then(setStats).catch(() => setStats(null));
  }, [period, page, search]);
  const loadStaff = useCallback(() => api.get<StaffRow[]>("/staff").then(setStaff).catch(() => {}), []);

  useEffect(load, [load]);
  useEffect(() => {
    loadStaff();
  }, [loadStaff]);
  const payslips = data?.items ?? null;

  const generate = async () => {
    setGenerating(true);
    try {
      const created = await api.post<Payslip[]>("/payroll/generate", { period });
      feedback.success(`${created.length} bulletin(s) généré(s)`, periodLabel(period));
      load();
    } catch (err) {
      feedback.error("Génération impossible", errorMessage(err));
    } finally {
      setGenerating(false);
    }
  };

  const act = async (p: Payslip, action: "validate" | "pay") => {
    if (action === "pay") {
      const ok = await feedback.confirm({
        title: `Marquer le salaire de ${p.staffMember.user.firstName} ${p.staffMember.user.lastName} comme payé ?`,
        message: `${formatFCFA(p.netSalary)} pour ${periodLabel(p.period)}. Le bulletin ne pourra plus être ajusté.`,
        confirmLabel: "Confirmer le paiement",
        tone: "warning",
      });
      if (!ok) return;
    }
    setBusy(p.id);
    try {
      await api.patch(`/payroll/${p.id}/${action}`);
      feedback.success(action === "pay" ? "Salaire payé" : "Bulletin validé", `${p.staffMember.user.firstName} ${p.staffMember.user.lastName}`);
      load();
    } catch (err) {
      feedback.error("Action impossible", errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const saveAdjustments = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    if (adjust.bonuses < 0 || adjust.deductions < 0) return setFormError("Les montants doivent être positifs");
    if (editing.baseSalary + adjust.bonuses - adjust.deductions < 0) return setFormError("Le salaire net ne peut pas être négatif");
    setBusy(editing.id);
    try {
      await api.patch(`/payroll/${editing.id}`, adjust);
      feedback.success("Bulletin ajusté");
      setEditing(null);
      load();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const setStaffSalary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!salaryForm.staffId) return;
    try {
      await api.patch(`/staff/${salaryForm.staffId}/salary`, { baseSalary: salaryForm.baseSalary });
      feedback.success("Salaire de base mis à jour", "Il s'appliquera aux prochains bulletins générés.");
      loadStaff();
    } catch (err) {
      feedback.error("Mise à jour impossible", errorMessage(err));
    }
  };

  const downloadPdf = async (p: Payslip) => {
    setBusy(`pdf-${p.id}`);
    try {
      await downloadFile(`/payroll/${p.id}/pdf`, `bulletin-paie-${p.period}.pdf`);
    } catch (err) {
      feedback.error("Téléchargement impossible", errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  // KPIs use the dedicated /payroll/stats endpoint so they stay correct across all pages,
  // not just the one currently shown in the table.
  const totalNet = stats?.totalNet ?? 0;
  const paidCount = stats?.paidCount ?? 0;
  const totalCount = stats?.count ?? 0;
  const withoutSalary = staff.filter((s) => s.staffMember && !s.staffMember.baseSalary).length;

  return (
    <Shell title="Paie du personnel">
      <PageHeader
        title="Paie du personnel"
        description="Générez les bulletins du mois, ajustez primes et retenues, validez puis payez."
        actions={
          <>
            <input type="month" className="input" style={{ width: "auto" }} aria-label="Période" value={period} onChange={(e) => setPeriod(e.target.value)} />
            <button className="btn btn-primary" onClick={generate} disabled={generating}>
              {generating ? <LoaderCircle size={16} className="spin" /> : <Wand2 size={16} />} Générer les bulletins
            </button>
          </>
        }
      />

      {totalCount > 0 && (
        <div className="kpi-grid">
          <KpiCard label={`Masse salariale nette`} icon={<Banknote size={16} />} value={formatFCFA(totalNet)} sub={periodLabel(period)} />
          <KpiCard label="Bulletins payés" icon={<CheckCircle2 size={16} />} accent="orange" value={`${paidCount}/${totalCount}`} meter={(paidCount / totalCount) * 100} />
        </div>
      )}
      {withoutSalary > 0 && (
        <div className="alert alert-warning" style={{ marginBottom: 12 }}>
          {withoutSalary} membre(s) du personnel n&apos;ont pas de salaire de base : ils sont exclus de la génération. Définissez-le ci-dessous.
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <SearchInput value={search} onChange={(v) => { setPage(1); setSearch(v); }} placeholder="Rechercher un employé…" />
      </div>

      <div className="table-wrap" style={{ marginBottom: 24 }}>
        {error ? (
          <EmptyState tone="error" title="Chargement impossible" action={<button className="btn btn-outline" onClick={load}>Réessayer</button>}>
            {error}
          </EmptyState>
        ) : !payslips ? (
          <TableSkeleton columns={6} rows={5} />
        ) : payslips.length === 0 ? (
          <EmptyState
            icon={<Banknote size={22} />}
            title={`Aucun bulletin pour ${periodLabel(period)}`}
            action={
              <button className="btn btn-primary" onClick={generate} disabled={generating}>
                <Wand2 size={16} /> Générer les bulletins
              </button>
            }
          />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Employé</th>
                <th className="num">Base</th>
                <th className="num">Primes</th>
                <th className="num">Retenues</th>
                <th className="num">Net</th>
                <th>Statut</th>
                <th className="actions">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {payslips.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="cell-main">
                      {p.staffMember.user.lastName} {p.staffMember.user.firstName}
                    </div>
                    <div className="cell-sub">{p.staffMember.position}</div>
                  </td>
                  <td className="num">{formatFCFA(p.baseSalary)}</td>
                  <td className="num">{p.bonuses ? `+ ${formatFCFA(p.bonuses)}` : "—"}</td>
                  <td className="num">{p.deductions ? `− ${formatFCFA(p.deductions)}` : "—"}</td>
                  <td className="num">
                    <strong>{formatFCFA(p.netSalary)}</strong>
                  </td>
                  <td>
                    <span className={`badge ${STATUS[p.status].badge}`}>{STATUS[p.status].label}</span>
                  </td>
                  <td className="actions">
                    <div className="btn-row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                      {p.status !== "PAID" && (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            setFormError(null);
                            setAdjust({ bonuses: p.bonuses, deductions: p.deductions });
                            setEditing(p);
                          }}
                        >
                          <SlidersHorizontal size={14} /> Ajuster
                        </button>
                      )}
                      {p.status === "DRAFT" && (
                        <button className="btn btn-outline btn-sm" onClick={() => act(p, "validate")} disabled={busy === p.id}>
                          Valider
                        </button>
                      )}
                      {p.status === "VALIDATED" && (
                        <button className="btn btn-secondary btn-sm" onClick={() => act(p, "pay")} disabled={busy === p.id}>
                          Payer
                        </button>
                      )}
                      <button className="btn btn-ghost btn-icon btn-sm" aria-label="Télécharger le bulletin PDF" title="Bulletin PDF" onClick={() => downloadPdf(p)} disabled={busy === `pdf-${p.id}`}>
                        {busy === `pdf-${p.id}` ? <LoaderCircle size={14} className="spin" /> : <FileDown size={15} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data && data.pageCount > 1 && (
          <Pagination page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} onPage={setPage} unit="bulletin" />
        )}
      </div>

      <form className="card" onSubmit={setStaffSalary}>
        <h2 className="card-title" style={{ marginBottom: 12 }}>
          Salaire de base
        </h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="field" style={{ marginBottom: 0, flex: "1 1 260px" }}>
            <label htmlFor="sal-staff">Employé</label>
            <select
              id="sal-staff"
              className="input"
              value={salaryForm.staffId}
              onChange={(e) => {
                const s = staff.find((x) => x.id === e.target.value);
                setSalaryForm({ staffId: e.target.value, baseSalary: s?.staffMember?.baseSalary ?? salaryForm.baseSalary });
              }}
            >
              <option value="">— Sélectionner —</option>
              {staff
                .filter((s) => s.staffMember)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.lastName} {s.firstName} — {s.staffMember?.baseSalary ? formatFCFA(s.staffMember.baseSalary) : "non défini"}
                  </option>
                ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="sal-amount">Montant mensuel (FCFA)</label>
            <input id="sal-amount" type="number" min={1} step={1000} className="input" value={salaryForm.baseSalary} onChange={(e) => setSalaryForm({ ...salaryForm, baseSalary: Number(e.target.value) })} />
          </div>
          <button type="submit" className="btn btn-secondary" disabled={!salaryForm.staffId || salaryForm.baseSalary <= 0}>
            <Save size={16} /> Enregistrer
          </button>
        </div>
      </form>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        busy={busy === editing?.id}
        title="Ajuster le bulletin"
        description={editing ? `${editing.staffMember.user.firstName} ${editing.staffMember.user.lastName} · ${periodLabel(editing.period)}` : undefined}
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setEditing(null)}>
              Annuler
            </button>
            <button type="submit" form="adjust-form" className="btn btn-primary" disabled={busy === editing?.id}>
              <Save size={16} /> Enregistrer
            </button>
          </>
        }
      >
        {editing && (
          <form id="adjust-form" onSubmit={saveAdjustments}>
            <FormError message={formError} />
            <div className="form-grid">
              <div className="field">
                <label htmlFor="adj-bonus">Primes (FCFA)</label>
                <input id="adj-bonus" type="number" min={0} className="input" value={adjust.bonuses} onChange={(e) => setAdjust({ ...adjust, bonuses: Number(e.target.value) })} />
              </div>
              <div className="field">
                <label htmlFor="adj-ded">Retenues (FCFA)</label>
                <input id="adj-ded" type="number" min={0} className="input" value={adjust.deductions} onChange={(e) => setAdjust({ ...adjust, deductions: Number(e.target.value) })} />
              </div>
            </div>
            <div className="list-row" style={{ borderTop: "1px solid var(--border)" }}>
              <span className="muted">Salaire net</span>
              <strong className="tabular" style={{ fontSize: 16 }}>
                {formatFCFA(editing.baseSalary + adjust.bonuses - adjust.deductions)}
              </strong>
            </div>
          </form>
        )}
      </Modal>
    </Shell>
  );
}
