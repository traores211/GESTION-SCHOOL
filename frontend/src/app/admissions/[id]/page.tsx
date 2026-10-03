"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardList,
  Eye,
  FileWarning,
  GraduationCap,
  Info,
  LoaderCircle,
  MessagesSquare,
  Paperclip,
  Pencil,
  Plus,
  Save,
  School,
  Upload,
  XCircle,
} from "lucide-react";
import Shell from "../../../components/Shell";
import { EmptyState, FormError, Modal, PageHeader, useFeedback } from "../../../components/ui";
import Timeline from "../../../components/admissions/Timeline";
import AdmissionForm, { AdmissionFormValues, admissionPayload } from "../../../components/admissions/AdmissionForm";
import { api, ApiError, authorizedFetch, errorMessage } from "../../../lib/api";
import {
  ClassOption,
  Dossier,
  MAIN_PATH,
  OPINION_LABELS,
  PIECE_LABELS,
  Piece,
  STATUS_LABELS,
  Transition,
  daysInProcess,
  formatDate,
  fullName,
  pathIndex,
  statusTone,
} from "../../../lib/admissions";
import "../admissions.css";

/** "2026-10-10T08:00" for datetime-local inputs, in local time. */
function toLocalInput(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formValues(d: Dossier): AdmissionFormValues {
  return {
    firstName: d.firstName,
    lastName: d.lastName,
    gender: d.gender,
    dateOfBirth: d.dateOfBirth ? d.dateOfBirth.slice(0, 10) : "",
    email: d.email ?? "",
    phone: d.phone ?? "",
    address: d.address ?? "",
    requestedLevel: d.requestedLevel ?? "",
    previousSchool: d.previousSchool ?? "",
    guardianName: d.guardianName ?? "",
    guardianRelation: d.guardianRelation ?? "",
    guardianPhone: d.guardianPhone ?? "",
    guardianEmail: d.guardianEmail ?? "",
  };
}

function DossierContent() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const feedback = useFeedback();
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<Transition | null>(null);
  const [reason, setReason] = useState("");
  const [editing, setEditing] = useState<AdmissionFormValues | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [refusing, setRefusing] = useState<Piece | null>(null);
  const [refuseNote, setRefuseNote] = useState("");
  const [newPiece, setNewPiece] = useState<{ label: string; required: boolean } | null>(null);
  const [classes, setClasses] = useState<ClassOption[] | null>(null);
  const [classId, setClassId] = useState("");
  const [test, setTest] = useState({ scheduledAt: "", score: "", maxScore: "20", comment: "" });
  const [interview, setInterview] = useState({ scheduledAt: "", opinion: "", notes: "", done: false });
  const uploadFor = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const apply = useCallback((d: Dossier) => {
    setDossier(d);
    setTest({ scheduledAt: toLocalInput(d.testScheduledAt), score: d.testScore != null ? String(d.testScore) : "", maxScore: String(d.testMaxScore ?? 20), comment: "" });
    setInterview({ scheduledAt: toLocalInput(d.interviewAt), opinion: d.interviewOpinion ?? "", notes: d.interviewNotes ?? "", done: d.interviewDone });
    setClassId(d.classId ?? "");
  }, []);

  const load = useCallback(() => {
    if (!id) return;
    api
      .get<Dossier>(`/admissions/${id}`)
      .then(apply)
      .catch((err) => setError(errorMessage(err)));
  }, [id, apply]);
  useEffect(load, [load]);

  const closed = dossier?.status === "CONFIRME";
  const canAssign = dossier && !["INSCRIPTION", "CONFIRME", "REJETE"].includes(dossier.status);
  useEffect(() => {
    if (!id || !canAssign || classes) return;
    api.get<ClassOption[]>(`/admissions/${id}/classes`).then(setClasses).catch(() => setClasses([]));
  }, [id, canAssign, classes]);

  /** Every write returns the updated dossier. */
  const run = async (key: string, call: () => Promise<Dossier>, success?: string) => {
    setBusy(key);
    try {
      apply(await call());
      if (success) feedback.success(success);
      return true;
    } catch (err) {
      feedback.error("Action impossible", errorMessage(err));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const doTransition = async (t: Transition, why?: string) => {
    const ok = await run(`t-${t.to}`, () => api.post<Dossier>(`/admissions/${id}/transition`, { to: t.to, ...(why ? { reason: why } : {}) }), `${STATUS_LABELS[t.to]}`);
    if (ok) {
      setPending(null);
      setReason("");
      if (t.to === "INSCRIPTION") setClasses(null);
    }
  };

  const openFile = async (piece: Piece) => {
    try {
      const res = await authorizedFetch(api.fileUrl(`/admissions/${id}/pieces/${piece.id}/file`));
      if (!res.ok) throw new ApiError(`Erreur ${res.status}`, res.status);
      const url = URL.createObjectURL(await res.blob());
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      feedback.error("Ouverture impossible", errorMessage(err));
    }
  };

  const upload = async (file: File | undefined) => {
    const pieceId = uploadFor.current;
    if (!file || !pieceId) return;
    await run(`up-${pieceId}`, () => api.upload<Dossier>(`/admissions/${id}/pieces/${pieceId}/file`, file), "Document ajouté");
    if (fileInput.current) fileInput.current.value = "";
  };

  if (error) return <EmptyState tone="error" title="Dossier introuvable" action={<Link href="/admissions" className="btn btn-outline">Retour aux admissions</Link>}>{error}</EmptyState>;
  if (!dossier) {
    return (
      <div aria-busy="true">
        <div className="skeleton" style={{ height: 40, width: 320, marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 120, marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 300 }} />
      </div>
    );
  }

  const d = dossier;
  const step = pathIndex(d.status);
  const rejected = d.status === "REJETE";
  const required = d.pieces.filter((p) => p.required);
  const received = required.filter((p) => p.status === "RECU" || p.status === "VALIDE").length;
  const tone = statusTone(d.status);
  const allowed = d.transitions.filter((t) => t.allowed);
  const blocked = d.transitions.filter((t) => !t.allowed);

  return (
    <>
      <PageHeader
        title={fullName(d)}
        breadcrumbs={[{ label: "Admissions", href: "/admissions" }, { label: d.reference ?? "Dossier" }]}
        description={`${d.reference ?? ""} · ${d.requestedLevel ? `demande en ${d.requestedLevel}` : "niveau non précisé"} · ${d.source === "EN_LIGNE" ? "déposée en ligne" : "saisie au guichet"} le ${formatDate(d.submittedAt)} · ${daysInProcess(d)} jour(s) de traitement`}
        actions={
          !closed && (
            <button type="button" className="btn btn-outline" onClick={() => setEditing(formValues(d))}>
              <Pencil size={16} /> Modifier les informations
            </button>
          )
        }
      />

      <section className="card adm-status" aria-label="Avancement du dossier">
        <div className="adm-status-head">
          <span className={tone === "olive" && d.status === "CONFIRME" ? "stamp stamp-olive" : tone === "danger" ? "stamp stamp-danger" : `badge badge-${tone === "olive" ? "green" : tone}`}>{STATUS_LABELS[d.status]}</span>
          {rejected && d.decisionReason && (
            <span className="adm-reason">
              <XCircle size={14} /> {d.decisionReason}
            </span>
          )}
          {d.student && (
            <Link href={`/students/${d.student.id}`} className="adm-student-link">
              <GraduationCap size={15} /> Fiche élève {d.student.matricule}
            </Link>
          )}
        </div>
        <ol className="stepper adm-stepper" aria-label="Étapes du processus d'admission">
          {MAIN_PATH.map((s, i) => {
            const done = i < step || d.status === "CONFIRME";
            const current = i === step && d.status !== "CONFIRME";
            const failed = rejected && i === step;
            return (
              <li key={s.status} className={`step${done ? " is-done" : ""}${current ? " is-current" : ""}${failed ? " is-failed" : ""}`} aria-current={current ? "step" : undefined}>
                {i > 0 && <span className="step-sep" aria-hidden="true" />}
                <span className="step-dot">{done ? <Check size={14} /> : failed ? <XCircle size={14} /> : i + 1}</span>
                <span className="step-label">{failed ? "Non retenu" : i === step && ["TEST", "ENTRETIEN", "DOSSIER_INCOMPLET"].includes(d.status) ? STATUS_LABELS[d.status] : s.label}</span>
              </li>
            );
          })}
        </ol>

        {(allowed.length > 0 || blocked.length > 0) && (
          <div className="adm-actions">
            <div className="btn-row">
              {d.transitions.map((t) => (
                <button
                  key={t.to + t.label}
                  type="button"
                  className={`btn ${t.tone === "primary" ? "btn-primary" : t.tone === "danger" ? "btn-danger-ghost" : "btn-outline"}`}
                  disabled={!t.allowed || busy !== null}
                  title={t.blockedBy}
                  onClick={() => (t.needsReason || t.to === "ADMIS" ? setPending(t) : doTransition(t))}
                >
                  {busy === `t-${t.to}` ? <LoaderCircle size={16} className="spin" /> : t.tone === "danger" ? <XCircle size={16} /> : <ArrowRight size={16} />} {t.label}
                </button>
              ))}
            </div>
            {blocked.length > 0 && (
              <ul className="adm-blocked">
                {blocked.map((t) => (
                  <li key={t.to + t.label}>
                    <Info size={13} /> <strong>{t.label}</strong> : {t.blockedBy}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {closed && (
          <p className="conflict-ok" style={{ marginTop: 12 }}>
            <CheckCircle2 size={16} /> Inscription confirmée le {formatDate(d.confirmedAt)} : le dossier est clos. La suite se gère depuis la fiche de l&apos;élève.
          </p>
        )}
      </section>

      <div className="adm-layout">
        <div className="adm-main">
          {/* ---------------------------------------------------------- pieces */}
          <section className="card" aria-labelledby="pieces-title">
            <div className="adm-card-head">
              <h2 id="pieces-title" className="card-title">
                <Paperclip size={17} /> Pièces du dossier
              </h2>
              <span className={`adm-count ${received === required.length ? "is-ok" : ""}`}>
                {received}/{required.length} obligatoires reçues
              </span>
            </div>
            <div className="meter" style={{ height: 6, marginBottom: 12 }} aria-hidden="true">
              <span style={{ width: `${required.length ? (received / required.length) * 100 : 100}%` }} />
            </div>
            <ul className="adm-pieces">
              {d.pieces.map((p) => (
                <li key={p.id} className={`adm-piece is-${p.status.toLowerCase()}`}>
                  <div className="adm-piece-main">
                    <span className="adm-piece-label">
                      {p.label}
                      {!p.required && <small> · facultative</small>}
                    </span>
                    <span className={`adm-piece-status is-${p.status.toLowerCase()}`}>{PIECE_LABELS[p.status]}</span>
                    {p.note && <span className="adm-piece-note">{p.note}</span>}
                    {p.hasFile && (
                      <button type="button" className="adm-file" onClick={() => openFile(p)}>
                        <Eye size={13} /> {p.fileName ?? "Voir le document"}
                      </button>
                    )}
                  </div>
                  {!closed && (
                    <div className="adm-piece-actions">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busy !== null}
                        onClick={() => {
                          uploadFor.current = p.id;
                          fileInput.current?.click();
                        }}
                        title="Joindre le document scanné (PDF, JPEG, PNG)"
                      >
                        {busy === `up-${p.id}` ? <LoaderCircle size={14} className="spin" /> : <Upload size={14} />} Joindre
                      </button>
                      {p.status !== "RECU" && p.status !== "VALIDE" && (
                        <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={() => run(`p-${p.id}`, () => api.patch<Dossier>(`/admissions/${id}/pieces/${p.id}`, { status: "RECU" }))}>
                          <Check size={14} /> Reçue
                        </button>
                      )}
                      {p.status !== "VALIDE" && (
                        <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={() => run(`p-${p.id}`, () => api.patch<Dossier>(`/admissions/${id}/pieces/${p.id}`, { status: "VALIDE" }))}>
                          <CheckCircle2 size={14} /> Valider
                        </button>
                      )}
                      {p.status !== "REFUSE" && (
                        <button type="button" className="btn btn-danger-ghost btn-sm" disabled={busy !== null} onClick={() => setRefusing(p)}>
                          <FileWarning size={14} /> Refuser
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {!closed && (
              <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setNewPiece({ label: "", required: false })}>
                <Plus size={14} /> Demander une autre pièce
              </button>
            )}
            <input ref={fileInput} type="file" accept="application/pdf,image/jpeg,image/png" className="visually-hidden" onChange={(e) => upload(e.target.files?.[0])} />
          </section>

          {/* ---------------------------------------------------------- test & interview */}
          <div className="adm-two">
            <section className="card" aria-labelledby="test-title">
              <h2 id="test-title" className="card-title">
                <ClipboardList size={17} /> Test d&apos;admission
              </h2>
              {d.testScore != null && (
                <p className="adm-score">
                  <strong>
                    {d.testScore.toLocaleString("fr-FR")}/{(d.testMaxScore ?? 20).toLocaleString("fr-FR")}
                  </strong>
                  <span>{(d.testScore / (d.testMaxScore ?? 20)) * 20 >= 10 ? "moyenne atteinte" : "sous la moyenne"}</span>
                </p>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  run("test", () =>
                    api.post<Dossier>(`/admissions/${id}/test`, {
                      ...(test.scheduledAt ? { scheduledAt: new Date(test.scheduledAt).toISOString() } : {}),
                      ...(test.score !== "" ? { score: Number(test.score), maxScore: Number(test.maxScore || 20) } : {}),
                      ...(test.comment.trim() ? { comment: test.comment.trim() } : {}),
                    }),
                  "Test enregistré",
                  );
                }}
              >
                <fieldset disabled={closed || busy !== null} className="adm-plain">
                  <div className="field">
                    <label htmlFor="test-date">Convocation</label>
                    <input id="test-date" type="datetime-local" className="input" value={test.scheduledAt} onChange={(e) => setTest({ ...test, scheduledAt: e.target.value })} />
                  </div>
                  <div className="form-grid">
                    <div className="field">
                      <label htmlFor="test-score">Note</label>
                      <input id="test-score" type="number" step="0.25" min={0} className="input" value={test.score} onChange={(e) => setTest({ ...test, score: e.target.value })} />
                    </div>
                    <div className="field">
                      <label htmlFor="test-max">Sur</label>
                      <input id="test-max" type="number" min={1} className="input" value={test.maxScore} onChange={(e) => setTest({ ...test, maxScore: e.target.value })} />
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="test-comment">Commentaire</label>
                    <input id="test-comment" className="input" maxLength={1000} placeholder="Ex. Bon niveau en mathématiques, lecture à renforcer" value={test.comment} onChange={(e) => setTest({ ...test, comment: e.target.value })} />
                  </div>
                  <button type="submit" className="btn btn-secondary btn-sm" disabled={!test.scheduledAt && test.score === "" && !test.comment.trim()}>
                    {busy === "test" ? <LoaderCircle size={14} className="spin" /> : <Save size={14} />} Enregistrer
                  </button>
                </fieldset>
              </form>
            </section>

            <section className="card" aria-labelledby="interview-title">
              <h2 id="interview-title" className="card-title">
                <MessagesSquare size={17} /> Entretien
              </h2>
              {d.interviewDone && (
                <p className="adm-score">
                  <strong>{d.interviewOpinion ? OPINION_LABELS[d.interviewOpinion] : "Réalisé"}</strong>
                  <span>entretien réalisé</span>
                </p>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  run("interview", () =>
                    api.post<Dossier>(`/admissions/${id}/interview`, {
                      ...(interview.scheduledAt ? { scheduledAt: new Date(interview.scheduledAt).toISOString() } : {}),
                      ...(interview.opinion ? { opinion: interview.opinion } : {}),
                      notes: interview.notes,
                      done: interview.done,
                    }),
                  "Entretien enregistré",
                  );
                }}
              >
                <fieldset disabled={closed || busy !== null} className="adm-plain">
                  <div className="form-grid">
                    <div className="field">
                      <label htmlFor="int-date">Date</label>
                      <input id="int-date" type="datetime-local" className="input" value={interview.scheduledAt} onChange={(e) => setInterview({ ...interview, scheduledAt: e.target.value })} />
                    </div>
                    <div className="field">
                      <label htmlFor="int-opinion">Avis</label>
                      <select id="int-opinion" className="input" value={interview.opinion} onChange={(e) => setInterview({ ...interview, opinion: e.target.value })}>
                        <option value="">—</option>
                        {Object.entries(OPINION_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="int-notes">Compte rendu</label>
                    <textarea id="int-notes" className="input" rows={3} maxLength={2000} value={interview.notes} onChange={(e) => setInterview({ ...interview, notes: e.target.value })} />
                  </div>
                  <label className="check-inline" style={{ marginBottom: 10 }}>
                    <input type="checkbox" checked={interview.done} onChange={(e) => setInterview({ ...interview, done: e.target.checked })} /> L&apos;entretien a eu lieu
                  </label>
                  <div>
                    <button type="submit" className="btn btn-secondary btn-sm">
                      {busy === "interview" ? <LoaderCircle size={14} className="spin" /> : <Save size={14} />} Enregistrer
                    </button>
                  </div>
                </fieldset>
              </form>
            </section>
          </div>

          {/* ---------------------------------------------------------- class & enrolment */}
          <section className="card" aria-labelledby="class-title">
            <h2 id="class-title" className="card-title">
              <School size={17} /> Classe et inscription
            </h2>
            {d.class ? (
              <p style={{ margin: "0 0 10px" }}>
                Classe affectée : <strong>{d.class.name}</strong>{" "}
                <span className="muted">
                  ({d.class.enrolled}/{d.class.capacity} élèves)
                </span>
                {d.enrolledAt && <span className="muted"> · inscrit le {formatDate(d.enrolledAt)}</span>}
              </p>
            ) : (
              <p className="muted" style={{ margin: "0 0 10px", fontSize: 13 }}>
                Aucune classe affectée. Elle est nécessaire pour inscrire l&apos;élève une fois admis.
              </p>
            )}
            {canAssign && (
              <div className="btn-row">
                <select className="input" style={{ width: "auto", minWidth: 220 }} aria-label="Classe" value={classId} onChange={(e) => setClassId(e.target.value)} disabled={!classes}>
                  <option value="">{classes ? "— Choisir une classe —" : "Chargement…"}</option>
                  {classes?.map((c) => (
                    <option key={c.id} value={c.id} disabled={c.free <= 0}>
                      {c.name} — {c.free > 0 ? `${c.free} place(s)` : "complète"}
                      {c.matchesLevel ? "" : " (autre niveau)"}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={!classId || classId === d.classId || busy !== null}
                  onClick={() => run("class", () => api.post<Dossier>(`/admissions/${id}/class`, { classId }), "Classe affectée")}
                >
                  {busy === "class" ? <LoaderCircle size={16} className="spin" /> : <School size={16} />} Affecter
                </button>
              </div>
            )}
            {d.student && (
              <p style={{ marginTop: 10, fontSize: 13 }}>
                <GraduationCap size={14} style={{ verticalAlign: "-2px" }} /> Fiche élève créée : <Link href={`/students/${d.student.id}`}>{d.student.matricule}</Link>
              </p>
            )}
          </section>

          {/* ---------------------------------------------------------- identity */}
          <section className="card" aria-labelledby="id-title">
            <h2 id="id-title" className="card-title">
              Identité et famille
            </h2>
            <dl className="adm-facts">
              <div>
                <dt>Date de naissance</dt>
                <dd>{formatDate(d.dateOfBirth)}</dd>
              </div>
              <div>
                <dt>Sexe</dt>
                <dd>{d.gender === "F" ? "Féminin" : "Masculin"}</dd>
              </div>
              <div>
                <dt>Niveau demandé</dt>
                <dd>{d.requestedLevel ?? "—"}</dd>
              </div>
              <div>
                <dt>École d&apos;origine</dt>
                <dd>{d.previousSchool ?? "—"}</dd>
              </div>
              <div>
                <dt>Contact</dt>
                <dd>{[d.phone, d.email].filter(Boolean).join(" · ") || "—"}</dd>
              </div>
              <div>
                <dt>Adresse</dt>
                <dd>{d.address ?? "—"}</dd>
              </div>
              <div>
                <dt>Responsable</dt>
                <dd>{d.guardianName ? `${d.guardianName}${d.guardianRelation ? ` (${d.guardianRelation})` : ""}` : "—"}</dd>
              </div>
              <div>
                <dt>Contact du responsable</dt>
                <dd>{[d.guardianPhone, d.guardianEmail].filter(Boolean).join(" · ") || "—"}</dd>
              </div>
              <div>
                <dt>Année scolaire</dt>
                <dd>{d.academicYear.name}</dd>
              </div>
            </dl>
          </section>
        </div>

        <aside className="card adm-aside" aria-labelledby="timeline-title">
          <h2 id="timeline-title" className="card-title">
            Historique du dossier <span className="tab-count">{d.events.length}</span>
          </h2>
          <Timeline
            events={d.events}
            canWrite={!closed}
            onAdd={(message, kind) => run("note", () => api.post<Dossier>(`/admissions/${id}/notes`, { message, kind }), kind === "CONTACT" ? "Échange enregistré" : "Note ajoutée")}
          />
        </aside>
      </div>

      <Modal
        open={!!pending}
        onClose={() => setPending(null)}
        busy={busy !== null}
        title={pending?.label ?? ""}
        description={pending ? `${fullName(d)} · ${STATUS_LABELS[d.status]} → ${STATUS_LABELS[pending.to]}` : undefined}
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setPending(null)}>
              Annuler
            </button>
            <button
              type="submit"
              form="transition-form"
              className={`btn ${pending?.tone === "danger" ? "btn-danger" : "btn-primary"}`}
              disabled={busy !== null || (!!pending?.needsReason && !reason.trim())}
            >
              {busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />} Confirmer
            </button>
          </>
        }
      >
        <form
          id="transition-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (pending) doTransition(pending, reason.trim() || undefined);
          }}
        >
          <div className="field">
            <label htmlFor="tr-reason" className={pending?.needsReason ? "required" : undefined}>
              {pending?.to === "REJETE" ? "Motif (communiqué à l'équipe et conservé dans l'historique)" : pending?.to === "ADMIS" ? "Motivation de la décision (facultatif)" : "Motif"}
            </label>
            <textarea id="tr-reason" className="input" rows={3} maxLength={1000} required={pending?.needsReason} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </form>
      </Modal>

      <Modal
        open={!!refusing}
        onClose={() => setRefusing(null)}
        title={`Refuser : ${refusing?.label ?? ""}`}
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setRefusing(null)}>
              Annuler
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={!refuseNote.trim() || busy !== null}
              onClick={async () => {
                if (!refusing) return;
                const ok = await run(`p-${refusing.id}`, () => api.patch<Dossier>(`/admissions/${id}/pieces/${refusing.id}`, { status: "REFUSE", note: refuseNote.trim() }), "Pièce refusée");
                if (ok) {
                  setRefusing(null);
                  setRefuseNote("");
                }
              }}
            >
              <FileWarning size={16} /> Refuser la pièce
            </button>
          </>
        }
      >
        <div className="field">
          <label htmlFor="refuse-note" className="required">
            Pourquoi ?
          </label>
          <textarea id="refuse-note" className="input" rows={3} maxLength={500} placeholder="Ex. Document illisible, copie non certifiée…" value={refuseNote} onChange={(e) => setRefuseNote(e.target.value)} />
        </div>
      </Modal>

      <Modal
        open={!!newPiece}
        onClose={() => setNewPiece(null)}
        title="Demander une autre pièce"
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setNewPiece(null)}>
              Annuler
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!newPiece?.label.trim() || busy !== null}
              onClick={async () => {
                if (!newPiece) return;
                if (await run("piece-add", () => api.post<Dossier>(`/admissions/${id}/pieces`, newPiece), "Pièce ajoutée au dossier")) setNewPiece(null);
              }}
            >
              <Plus size={16} /> Ajouter
            </button>
          </>
        }
      >
        {newPiece && (
          <>
            <div className="field">
              <label htmlFor="piece-label" className="required">
                Pièce
              </label>
              <input id="piece-label" className="input" maxLength={120} placeholder="Ex. Certificat médical" value={newPiece.label} onChange={(e) => setNewPiece({ ...newPiece, label: e.target.value })} />
            </div>
            <label className="check-inline">
              <input type="checkbox" checked={newPiece.required} onChange={(e) => setNewPiece({ ...newPiece, required: e.target.checked })} /> Obligatoire pour valider le dossier
            </label>
          </>
        )}
      </Modal>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        busy={busy === "edit"}
        size="lg"
        title="Modifier les informations"
        description="Chaque modification est tracée dans l'historique du dossier."
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setEditing(null)}>
              Annuler
            </button>
            <button type="submit" form="edit-admission" className="btn btn-primary" disabled={busy === "edit"}>
              {busy === "edit" ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />} Enregistrer
            </button>
          </>
        }
      >
        {editing && (
          <>
            <FormError message={formError} />
            <AdmissionForm
              id="edit-admission"
              values={editing}
              onChange={setEditing}
              onSubmit={async (e) => {
                e.preventDefault();
                setFormError(null);
                setBusy("edit");
                try {
                  apply(await api.patch<Dossier>(`/admissions/${id}`, admissionPayload(editing, true)));
                  setEditing(null);
                  feedback.success("Informations enregistrées");
                } catch (err) {
                  setFormError(errorMessage(err));
                } finally {
                  setBusy(null);
                }
              }}
            />
          </>
        )}
      </Modal>
    </>
  );
}

export default function AdmissionDossierPage() {
  return (
    <Shell title="Dossier d'admission">
      <DossierContent />
    </Shell>
  );
}
