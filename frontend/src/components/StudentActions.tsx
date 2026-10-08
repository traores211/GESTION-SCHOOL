"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Copy, KeyRound, RotateCcw } from "lucide-react";
import { FormError, Modal, useFeedback } from "./ui";
import { api, authorizedFetch, errorMessage } from "../lib/api";
import { getStoredUser } from "../lib/auth";

const OFFICE = ["SUPER_ADMIN", "ADMIN_ORGANISATION", "DIRECTOR", "SECRETARY"];

interface Year {
  id: string;
  name: string;
  status: string;
}
interface ClassOption {
  id: string;
  name: string;
  capacity: number;
  _count: { enrollments: number };
}

/** Identity photo of a pupil, loaded through the API (the file is private). */
export function StudentPhoto({ studentId, hasPhoto, name, onChanged }: { studentId: string; hasPhoto: boolean; name: string; onChanged: () => void }) {
  const feedback = useFeedback();
  const canEdit = OFFICE.includes(getStoredUser()?.role ?? "");
  const [url, setUrl] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!hasPhoto) return setUrl(null);
    let objectUrl: string | null = null;
    authorizedFetch(api.fileUrl(`/students/${studentId}/photo`))
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (!blob) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {});
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [studentId, hasPhoto]);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    try {
      await api.upload(`/students/${studentId}/photo`, file);
      feedback.success("Photo enregistrée", name);
      onChanged();
    } catch (err) {
      feedback.error("Photo refusée", errorMessage(err));
    }
    if (input.current) input.current.value = "";
  };

  return (
    <div className="student-photo">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={`Photo d'identité de ${name}`} />
      ) : (
        <div className="student-photo-empty" aria-hidden="true">
          <Camera size={22} />
        </div>
      )}
      {canEdit && (
        <>
          <input ref={input} type="file" hidden accept="image/jpeg,image/png" aria-hidden="true" tabIndex={-1} onChange={(e) => upload(e.target.files?.[0])} />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => input.current?.click()}>
            {hasPhoto ? "Changer la photo" : "Ajouter une photo"}
          </button>
        </>
      )}
    </div>
  );
}

/** Office actions on a pupil record: re-enrolment in a class of an open year, and the pupil's own account. */
export default function StudentActions({ studentId, name, hasAccount, onChanged }: { studentId: string; name: string; hasAccount: boolean; onChanged: () => void }) {
  const feedback = useFeedback();
  const [mode, setMode] = useState<"reenrol" | "account" | null>(null);
  const [years, setYears] = useState<Year[]>([]);
  const [yearId, setYearId] = useState("");
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classId, setClassId] = useState("");
  const [email, setEmail] = useState("");
  const [created, setCreated] = useState<{ email: string; temporaryPassword: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode !== "reenrol") return;
    api
      .get<Year[]>("/academic-years")
      .then((list) => {
        const open = list.filter((y) => y.status === "OUVERTE" || y.status === "PREPARATION");
        setYears(open);
        setYearId((v) => v || open[0]?.id || "");
      })
      .catch((err) => setError(errorMessage(err)));
  }, [mode]);

  useEffect(() => {
    setClassId("");
    if (!yearId) return setClasses([]);
    api
      .get<ClassOption[]>(`/classes?academicYearId=${yearId}`)
      .then(setClasses)
      .catch(() => setClasses([]));
  }, [yearId]);

  if (!OFFICE.includes(getStoredUser()?.role ?? "")) return null;

  const close = () => {
    setMode(null);
    setError(null);
    setCreated(null);
    setEmail("");
  };

  const reenrol = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ class: string; year: string; restored: boolean }>(`/promotion/students/${studentId}/reenrol`, { classId });
      feedback.success("Élève réinscrit", `${name} : ${res.class}, ${res.year}${res.restored ? " (dossier restauré)" : ""}`);
      close();
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const createAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setCreated(await api.post<{ email: string; temporaryPassword: string }>(`/students/${studentId}/account`, { email: email.trim().toLowerCase() }));
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const closeAccount = async () => {
    const yes = await feedback.confirm({ title: `Fermer le compte de ${name} ?`, message: "L'élève ne pourra plus se connecter. Son dossier, ses notes et ses bulletins ne changent pas.", confirmLabel: "Fermer le compte", tone: "warning" });
    if (!yes) return;
    try {
      await api.delete(`/students/${studentId}/account`);
      feedback.success("Compte fermé", name);
      onChanged();
    } catch (err) {
      feedback.error("Fermeture impossible", errorMessage(err));
    }
  };

  return (
    <>
      <button type="button" className="btn btn-outline btn-sm" onClick={() => setMode("reenrol")}>
        <RotateCcw size={15} /> Réinscrire
      </button>
      {hasAccount ? (
        <button type="button" className="btn btn-ghost btn-sm" onClick={closeAccount}>
          <KeyRound size={15} /> Fermer le compte élève
        </button>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode("account")}>
          <KeyRound size={15} /> Créer un compte élève
        </button>
      )}

      <Modal
        open={mode === "reenrol"}
        onClose={close}
        busy={busy}
        title={`Réinscrire ${name}`}
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={close} disabled={busy}>
              Annuler
            </button>
            <button type="submit" form="reenrol-form" className="btn btn-primary" disabled={busy || !classId}>
              Réinscrire
            </button>
          </>
        }
      >
        <form id="reenrol-form" onSubmit={reenrol}>
          <FormError message={error} />
          <p className="field-hint" style={{ marginBottom: 12 }}>
            Le dossier existant est repris tel quel (identité, parents, documents, historique). Vous pourrez le mettre à jour ensuite. Pour toute une classe, utilisez « Années &amp; passage ».
          </p>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="re-year" className="required">
                Année scolaire
              </label>
              <select id="re-year" className="input" required value={yearId} onChange={(e) => setYearId(e.target.value)}>
                {years.length === 0 && <option value="">Aucune année ouverte</option>}
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="re-class" className="required">
                Classe
              </label>
              <select id="re-class" className="input" required value={classId} onChange={(e) => setClassId(e.target.value)}>
                <option value="">Choisir une classe…</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id} disabled={c._count.enrollments >= c.capacity}>
                    {c.name} ({c._count.enrollments}/{c.capacity})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={mode === "account"}
        onClose={close}
        busy={busy}
        title={`Compte élève de ${name}`}
        footer={
          created ? (
            <button type="button" className="btn btn-primary" onClick={close}>
              Terminé
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-outline" onClick={close} disabled={busy}>
                Annuler
              </button>
              <button type="submit" form="pupil-account-form" className="btn btn-primary" disabled={busy}>
                Créer le compte
              </button>
            </>
          )
        }
      >
        {created ? (
          <div role="status">
            <p>
              Compte créé pour <strong>{created.email}</strong>. Mot de passe provisoire, affiché une seule fois :
            </p>
            <p style={{ display: "flex", gap: 8, alignItems: "center", margin: "10px 0" }}>
              <code className="tabular" style={{ fontSize: 18 }}>
                {created.temporaryPassword}
              </code>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(created.temporaryPassword)} aria-label="Copier le mot de passe provisoire">
                <Copy size={15} /> Copier
              </button>
            </p>
            <p className="field-hint">L&apos;élève consulte son propre dossier : notes, bulletins, emploi du temps, devoirs, absences, documents partagés. Il ne voit ni les frais de scolarité ni les autres élèves, et ne peut rien modifier.</p>
          </div>
        ) : (
          <form id="pupil-account-form" onSubmit={createAccount}>
            <FormError message={error} />
            <div className="field">
              <label htmlFor="pa-account-email" className="required">
                Adresse e-mail de l&apos;élève
              </label>
              <input id="pa-account-email" type="email" className="input" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
