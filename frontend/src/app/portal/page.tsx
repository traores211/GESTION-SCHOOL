"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, LoaderCircle, Smartphone } from "lucide-react";
import Shell from "../../components/Shell";
import { api, errorMessage } from "../../lib/api";
import { downloadFile } from "../../lib/download";
import { EmptyState, PageHeader, useFeedback } from "../../components/ui";
import { ATTENDANCE_STATUS, INVOICE_STATUS, statusBadge } from "../../lib/labels";
import "./portal.css";

interface Child {
  id: string;
  firstName: string;
  lastName: string;
  matricule: string;
  enrollments: { class: { name: string } }[];
  school: { name: string };
}

interface ChildDetail extends Child {
  attendance: { id: string; date: string; status: string; justification: string | null; justificationRequest: string | null }[];
  grades: { score: number; maxScore: number; subject: { name: string }; term: { name: string } }[];
  invoices: { id: string; reference: string; label: string; totalAmount: number; dueDate: string; status: string; payments: { amount: number; status: string }[] }[];
}

interface Bulletin {
  termId: string;
  name: string;
  published: boolean;
  availableOn: string;
  average: number | null;
  rankLabel: string | null;
  classSize: number | null;
  distinction: string | null;
  councilAppreciation: string | null;
  decisionLabel: string | null;
}

interface Lesson {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  subject: string;
  teacher: string | null;
  room: string | null;
}

const TABS = [
  { id: "summary", label: "Résumé" },
  { id: "bulletins", label: "Bulletins" },
  { id: "absences", label: "Absences" },
  { id: "timetable", label: "Emploi du temps" },
  { id: "fees", label: "Scolarité" },
] as const;
type Tab = (typeof TABS)[number]["id"];
const DAYS = ["", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

const fcfa = (amount: number) => new Intl.NumberFormat("fr-FR").format(Math.round(amount)) + " FCFA";
const shortDate = (value: string) => new Date(value).toLocaleDateString("fr-FR");
const paidOf = (inv: ChildDetail["invoices"][number]) => inv.payments.filter((p) => p.status === "SUCCESS").reduce((s, p) => s + p.amount, 0);

function PortalContent() {
  const feedback = useFeedback();
  const [children, setChildren] = useState<Child[] | null>(null);
  const [childId, setChildId] = useState("");
  const [child, setChild] = useState<ChildDetail | null>(null);
  const [bulletins, setBulletins] = useState<Bulletin[] | null>(null);
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [tab, setTab] = useState<Tab>("summary");
  const [error, setError] = useState<string | null>(null);
  const [onlineEnabled, setOnlineEnabled] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Child[]>("/parent-portal/children")
      .then((list) => {
        setChildren(list);
        if (list[0]) setChildId(list[0].id);
      })
      .catch((err) => setError(errorMessage(err, "Erreur de chargement")));
    api.get<{ enabled: boolean }>("/payments/config").then((c) => setOnlineEnabled(c.enabled)).catch(() => {});
  }, []);

  const loadChild = useCallback(() => {
    if (!childId) return;
    api.get<ChildDetail>(`/parent-portal/children/${childId}`).then(setChild).catch((err) => setError(errorMessage(err)));
  }, [childId]);

  useEffect(() => {
    setChild(null);
    setBulletins(null);
    setLessons(null);
    loadChild();
  }, [loadChild]);

  // Report cards and timetable are fetched the first time their tab is opened.
  useEffect(() => {
    if (!childId) return;
    if (tab === "bulletins" && !bulletins) api.get<Bulletin[]>(`/parent-portal/children/${childId}/bulletins`).then(setBulletins).catch(() => setBulletins([]));
    if (tab === "timetable" && !lessons) api.get<{ sessions: Lesson[] }>(`/parent-portal/children/${childId}/timetable`).then((t) => setLessons(t.sessions)).catch(() => setLessons([]));
  }, [tab, childId, bulletins, lessons]);

  const pay = async (invoiceId: string) => {
    setBusy(invoiceId);
    try {
      const link = await api.post<{ shareUrl: string }>(`/parent-portal/invoices/${invoiceId}/pay`, {});
      window.location.href = link.shareUrl;
    } catch (err) {
      feedback.error("Paiement impossible", errorMessage(err));
      setBusy(null);
    }
  };

  const justify = async (absence: ChildDetail["attendance"][number]) => {
    const reason = await feedback.prompt({
      title: `Justifier l'absence du ${shortDate(absence.date)}`,
      message: "Indiquez le motif (maladie, rendez-vous médical, raison familiale…). Le secrétariat validera le justificatif ; remettez-lui le certificat s'il y en a un.",
      label: "Motif de l'absence",
      confirmLabel: "Envoyer le justificatif",
      minLength: 5,
    });
    if (!reason) return;
    try {
      await api.post(`/parent-portal/children/${childId}/absences/${absence.id}/justify`, { reason });
      feedback.success("Justificatif envoyé", "L'établissement vous répondra après vérification.");
      loadChild();
    } catch (err) {
      feedback.error("Envoi impossible", errorMessage(err));
    }
  };

  const downloadBulletin = async (b: Bulletin) => {
    setBusy(b.termId);
    try {
      await downloadFile(`/parent-portal/children/${childId}/bulletins/${b.termId}/pdf`, `bulletin-${child?.matricule ?? ""}-${b.name}.pdf`);
    } catch (err) {
      feedback.error("Bulletin indisponible", errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  if (error && !children) {
    return (
      <div className="card">
        <EmptyState tone="error" title="Informations indisponibles">
          {error}
        </EmptyState>
      </div>
    );
  }
  if (children && children.length === 0) {
    return (
      <div className="card">
        <EmptyState title="Aucun enfant rattaché à ce compte">Contactez le secrétariat de l&apos;établissement pour rattacher vos enfants à votre compte.</EmptyState>
      </div>
    );
  }

  const absences = child?.attendance.filter((a) => a.status !== "PRESENT") ?? [];
  const due = child ? child.invoices.filter((i) => i.status !== "CANCELLED").reduce((s, i) => s + Math.max(0, i.totalAmount - paidOf(i)), 0) : 0;
  const days = lessons ? [...new Set(lessons.map((l) => l.dayOfWeek))].sort() : [];

  return (
    <>
      <PageHeader title="Mes enfants" description="Suivi scolaire : résultats, bulletins, absences, emploi du temps et scolarité." />

      {children && children.length > 1 && (
        <div className="portal-children" role="group" aria-label="Choisir un enfant">
          {children.map((c) => (
            <button key={c.id} type="button" className={`btn ${childId === c.id ? "btn-primary" : "btn-outline"} btn-sm`} aria-pressed={childId === c.id} onClick={() => setChildId(c.id)}>
              {c.firstName} {c.lastName}
            </button>
          ))}
        </div>
      )}

      {!child ? (
        <div className="skeleton" style={{ height: 160 }} />
      ) : (
        <>
          <div className="card portal-identity">
            <div>
              <h2>
                {child.firstName} {child.lastName}
              </h2>
              <p className="muted">
                {child.enrollments[0]?.class?.name || "Non affecté"} · Matricule {child.matricule} · {child.school.name}
              </p>
            </div>
            {due > 0 && (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setTab("fees")}>
                Reste à payer : {fcfa(due)}
              </button>
            )}
          </div>

          <div className="tabs" role="tablist" aria-label="Rubriques">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" className="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
                {t.label}
                {t.id === "absences" && absences.length > 0 && <span className="portal-count">{absences.length}</span>}
              </button>
            ))}
          </div>

          {tab === "summary" && (
            <div className="grid-2">
              <div className="card">
                <h3 className="card-title">Dernières notes</h3>
                {child.grades.slice(0, 8).map((g, i) => (
                  <div key={i} className="portal-line">
                    <span>
                      {g.subject.name} <span className="muted">({g.term.name})</span>
                    </span>
                    <strong className="tabular">
                      {String(g.score).replace(".", ",")}/{g.maxScore}
                    </strong>
                  </div>
                ))}
                {child.grades.length === 0 && <p className="muted">Aucune note pour l&apos;instant.</p>}
              </div>
              <div className="card">
                <h3 className="card-title">Présence récente</h3>
                {child.attendance.slice(0, 8).map((a) => (
                  <div key={a.id} className="portal-line">
                    <span>{shortDate(a.date)}</span>
                    <span className={`badge ${statusBadge(ATTENDANCE_STATUS, a.status).badge}`}>{statusBadge(ATTENDANCE_STATUS, a.status).label}</span>
                  </div>
                ))}
                {child.attendance.length === 0 && <p className="muted">Aucun appel enregistré pour l&apos;instant.</p>}
              </div>
            </div>
          )}

          {tab === "bulletins" &&
            (!bulletins ? (
              <div className="skeleton" style={{ height: 120 }} />
            ) : bulletins.length === 0 ? (
              <div className="card">
                <EmptyState title="Aucun bulletin">L&apos;élève n&apos;est inscrit dans aucune classe cette année.</EmptyState>
              </div>
            ) : (
              <div className="portal-cards">
                {bulletins.map((b) => (
                  <div key={b.termId} className="card">
                    <h3 className="card-title">{b.name}</h3>
                    {b.published && b.average === null ? (
                      <p className="muted">Aucune note enregistrée pour cette période.</p>
                    ) : b.published ? (
                      <>
                        <p className="portal-average">
                          <strong>{b.average === null ? "—" : b.average.toFixed(2).replace(".", ",")}</strong> / 20
                        </p>
                        <p className="muted">{b.rankLabel ? `${b.rankLabel} sur ${b.classSize} élèves classés` : "Non classé"}</p>
                        {b.distinction && <p><span className="badge badge-green">{b.distinction}</span></p>}
                        {b.councilAppreciation && <p className="portal-quote">« {b.councilAppreciation} »</p>}
                        {b.decisionLabel && (
                          <p>
                            <strong>{b.decisionLabel}</strong>
                          </p>
                        )}
                        <button type="button" className="btn btn-outline btn-sm" disabled={busy !== null} onClick={() => downloadBulletin(b)}>
                          {busy === b.termId ? <LoaderCircle size={14} className="spin" /> : <Download size={14} />} Télécharger le bulletin
                        </button>
                      </>
                    ) : (
                      <p className="muted">Disponible à la fin de la période, après le {shortDate(b.availableOn)}.</p>
                    )}
                  </div>
                ))}
              </div>
            ))}

          {tab === "absences" && (
            <div className="card">
              {absences.length === 0 ? (
                <EmptyState title="Aucune absence ni retard">Sur les 30 derniers appels.</EmptyState>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Statut</th>
                        <th>Justificatif</th>
                        <th className="actions">
                          <span className="visually-hidden">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {absences.map((a) => (
                        <tr key={a.id}>
                          <td className="nowrap">{shortDate(a.date)}</td>
                          <td>
                            <span className={`badge ${statusBadge(ATTENDANCE_STATUS, a.status).badge}`}>{statusBadge(ATTENDANCE_STATUS, a.status).label}</span>
                          </td>
                          <td>{a.justification ?? (a.justificationRequest ? <span className="muted">En attente de validation : {a.justificationRequest}</span> : <span className="muted">—</span>)}</td>
                          <td className="actions">
                            {a.status === "ABSENT" && (
                              <button type="button" className="btn btn-outline btn-sm" onClick={() => justify(a)}>
                                {a.justificationRequest ? "Modifier" : "Justifier"}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === "timetable" &&
            (!lessons ? (
              <div className="skeleton" style={{ height: 160 }} />
            ) : lessons.length === 0 ? (
              <div className="card">
                <EmptyState title="Emploi du temps non publié">L&apos;établissement n&apos;a pas encore saisi l&apos;emploi du temps de cette classe.</EmptyState>
              </div>
            ) : (
              <div className="portal-cards">
                {days.map((day) => (
                  <div key={day} className="card">
                    <h3 className="card-title">{DAYS[day]}</h3>
                    {lessons
                      .filter((l) => l.dayOfWeek === day)
                      .map((l) => (
                        <div key={l.id} className="portal-lesson">
                          <span className="tabular">
                            {l.startTime} – {l.endTime}
                          </span>
                          <span>
                            <strong>{l.subject}</strong>
                            {(l.teacher || l.room) && <span className="muted">{[l.teacher, l.room].filter(Boolean).join(" · ")}</span>}
                          </span>
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            ))}

          {tab === "fees" && (
            <div className="card">
              {child.invoices.length === 0 ? (
                <EmptyState title="Aucune facture" />
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Facture</th>
                        <th className="num">Montant</th>
                        <th className="num">Payé</th>
                        <th>Échéance</th>
                        <th>Statut</th>
                        <th className="actions">
                          <span className="visually-hidden">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {child.invoices.map((inv) => {
                        const paid = paidOf(inv);
                        const payable = onlineEnabled && !["PAID", "CANCELLED", "DRAFT"].includes(inv.status) && paid < inv.totalAmount;
                        return (
                          <tr key={inv.id}>
                            <td>
                              <div className="cell-main">{inv.label}</div>
                              <div className="cell-sub tabular">{inv.reference}</div>
                            </td>
                            <td className="num">{fcfa(inv.totalAmount)}</td>
                            <td className="num">{fcfa(paid)}</td>
                            <td className="nowrap">{shortDate(inv.dueDate)}</td>
                            <td>
                              <span className={`badge ${statusBadge(INVOICE_STATUS, inv.status).badge}`}>{statusBadge(INVOICE_STATUS, inv.status).label}</span>
                            </td>
                            <td className="actions">
                              {payable && (
                                <button type="button" className="btn btn-primary btn-sm" onClick={() => pay(inv.id)} disabled={busy !== null}>
                                  <Smartphone size={14} /> {busy === inv.id ? "Ouverture…" : "Payer"}
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}

export default function ParentPortalPage() {
  return (
    <Shell title="Mon espace parent">
      <PortalContent />
    </Shell>
  );
}
