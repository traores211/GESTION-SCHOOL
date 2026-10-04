"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Eye, LoaderCircle, Plus, Save, Send, Trash2, Undo2 } from "lucide-react";
import Shell from "../../../components/Shell";
import { FormError, PageHeader, useFeedback } from "../../../components/ui";
import { api, errorMessage } from "../../../lib/api";

interface Fields {
  tagline: string;
  description: string;
  primaryColor: string;
  history: string;
  values: string;
  directorName: string;
  directorMessage: string;
  openingHours: string;
  facilities: string;
  activities: string;
  events: { title: string; date: string; description: string }[];
  downloads: { label: string; url: string }[];
}
interface DraftState {
  published: Record<string, unknown> & { code: string; name: string };
  draft: Record<string, unknown> | null;
  hasDraft: boolean;
  draftAt: string | null;
  publishedAt: string | null;
}

const text = (v: unknown) => (typeof v === "string" ? v : "");
const lines = (v: unknown) => (Array.isArray(v) ? v.join("\n") : "");

/** The form starts from the draft when there is one, otherwise from what is published. */
function toFields(source: Record<string, unknown>): Fields {
  return {
    tagline: text(source.tagline),
    description: text(source.description),
    primaryColor: text(source.primaryColor),
    history: text(source.history),
    values: text(source.values),
    directorName: text(source.directorName),
    directorMessage: text(source.directorMessage),
    openingHours: text(source.openingHours),
    facilities: lines(source.facilities),
    activities: lines(source.activities),
    events: Array.isArray(source.events) ? (source.events as Fields["events"]).map((e) => ({ title: e.title ?? "", date: (e.date ?? "").slice(0, 10), description: e.description ?? "" })) : [],
    downloads: Array.isArray(source.downloads) ? (source.downloads as Fields["downloads"]).map((d) => ({ label: d.label ?? "", url: d.url ?? "" })) : [],
  };
}

const list = (value: string) => value.split("\n").map((l) => l.trim()).filter(Boolean);

function toDraft(f: Fields) {
  return {
    tagline: f.tagline.trim() || null,
    description: f.description.trim() || null,
    primaryColor: f.primaryColor || null,
    history: f.history.trim() || null,
    values: f.values.trim() || null,
    directorName: f.directorName.trim() || null,
    directorMessage: f.directorMessage.trim() || null,
    openingHours: f.openingHours.trim() || null,
    facilities: list(f.facilities),
    activities: list(f.activities),
    events: f.events.filter((e) => e.title.trim() && e.date).map((e) => ({ title: e.title.trim(), date: e.date, description: e.description.trim() || null })),
    downloads: f.downloads.filter((d) => d.label.trim() && d.url.trim()).map((d) => ({ label: d.label.trim(), url: d.url.trim() })),
  };
}

function DraftContent() {
  const feedback = useFeedback();
  const [state, setState] = useState<DraftState | null>(null);
  const [fields, setFields] = useState<Fields | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const apply = (s: DraftState) => {
    setState(s);
    setFields(toFields({ ...s.published, ...(s.draft ?? {}) }));
  };
  const load = useCallback(() => {
    api.get<DraftState>("/showcase/draft").then(apply).catch((err) => setError(errorMessage(err)));
  }, []);
  useEffect(load, [load]);

  const run = async (action: () => Promise<DraftState>, done: string, detail?: string) => {
    setBusy(true);
    setError(null);
    try {
      apply(await action());
      feedback.success(done, detail);
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = () => fields && run(() => api.put<DraftState>("/showcase/draft", toDraft(fields)), "Brouillon enregistré", "La page publique n'a pas changé.");
  const preview = async () => {
    if (fields && state && (await save())) window.open(`/ecole/${state.published.code}?apercu=1`, "_blank", "noopener");
  };
  const publish = async () => {
    if (!fields) return;
    const yes = await feedback.confirm({ title: "Publier ces modifications ?", message: "La page publique de l'établissement affichera aussitôt le nouveau contenu.", confirmLabel: "Publier" });
    if (!yes) return;
    if (await run(() => api.put<DraftState>("/showcase/draft", toDraft(fields)), "Brouillon enregistré")) await run(() => api.post<DraftState>("/showcase/publish"), "Vitrine publiée", "Le nouveau contenu est en ligne.");
  };
  const discard = async () => {
    const yes = await feedback.confirm({ title: "Abandonner le brouillon ?", message: "Les modifications non publiées sont perdues. La page publique reste telle qu'elle est.", confirmLabel: "Abandonner", tone: "warning" });
    if (yes) await run(() => api.delete<DraftState>("/showcase/draft"), "Brouillon abandonné");
  };

  if (!fields || !state) return error ? <FormError message={error} /> : <div className="skeleton" style={{ height: 320 }} />;
  const set = <K extends keyof Fields>(key: K, value: Fields[K]) => setFields({ ...fields, [key]: value });
  const area = (key: "description" | "history" | "values" | "directorMessage" | "facilities" | "activities", label: string, hint?: string, rows = 4) => (
    <div className="field full">
      <label htmlFor={`sd-${key}`}>{label}</label>
      <textarea id={`sd-${key}`} className="input" rows={rows} value={fields[key]} onChange={(e) => set(key, e.target.value)} />
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );

  return (
    <>
      <PageHeader
        title="Vitrine : brouillon et aperçu"
        description="Préparez le contenu de la page publique sans le montrer, regardez l'aperçu, puis publiez en une fois."
        breadcrumbs={[{ label: "Annonces & vitrine", href: "/announcements" }, { label: "Brouillon" }]}
        actions={
          <>
            <button type="button" className="btn btn-outline" onClick={preview} disabled={busy}>
              <Eye size={16} /> Aperçu
            </button>
            <button type="button" className="btn btn-primary" onClick={publish} disabled={busy}>
              {busy ? <LoaderCircle size={16} className="spin" /> : <Send size={16} />} Publier
            </button>
          </>
        }
      />
      <div className={`alert ${state.hasDraft ? "alert-warning" : "alert-success"}`} role="status" style={{ marginBottom: 16 }}>
        <div className="alert-body">
          {state.hasDraft ? (
            <>
              <span className="alert-title">Brouillon non publié</span> enregistré le {new Date(state.draftAt ?? "").toLocaleString("fr-FR")}. Les visiteurs voient encore l&apos;ancienne version.
            </>
          ) : (
            <>
              <span className="alert-title">Aucune modification en attente.</span> {state.publishedAt ? `Dernière publication le ${new Date(state.publishedAt).toLocaleString("fr-FR")}.` : "Ce que vous saisissez ici reste un brouillon jusqu'à la publication."}
            </>
          )}{" "}
          <Link href={`/ecole/${state.published.code}`} target="_blank">
            Voir la page publique ↗
          </Link>
        </div>
      </div>
      <FormError message={error} />

      <h2 className="form-section">Identité</h2>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="sd-tagline">Slogan</label>
          <input id="sd-tagline" className="input" maxLength={160} value={fields.tagline} onChange={(e) => set("tagline", e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="sd-color">Couleur de l&apos;établissement</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input id="sd-color" type="color" value={fields.primaryColor || "#1a7f4b"} onChange={(e) => set("primaryColor", e.target.value)} style={{ width: 48, height: 36, padding: 2 }} />
            {fields.primaryColor ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => set("primaryColor", "")}>
                Couleur par défaut
              </button>
            ) : (
              <span className="field-hint">Couleur par défaut</span>
            )}
          </div>
        </div>
        {area("description", "Présentation de l'établissement")}
      </div>

      <h2 className="form-section">Présentation détaillée</h2>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="sd-director">Nom du directeur ou de la directrice</label>
          <input id="sd-director" className="input" maxLength={120} value={fields.directorName} onChange={(e) => set("directorName", e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="sd-hours">Horaires d&apos;ouverture</label>
          <input id="sd-hours" className="input" maxLength={300} placeholder="Du lundi au vendredi, 7h–17h" value={fields.openingHours} onChange={(e) => set("openingHours", e.target.value)} />
        </div>
        {area("directorMessage", "Mot du directeur")}
        {area("history", "Historique")}
        {area("values", "Valeurs", undefined, 3)}
        {area("facilities", "Infrastructures", "Une par ligne : bibliothèque, laboratoire, terrain de sport…", 3)}
        {area("activities", "Activités", "Une par ligne : clubs, sorties, compétitions…", 3)}
      </div>

      <h2 className="form-section">Événements</h2>
      {fields.events.map((ev, i) => (
        <div className="form-grid" key={i} style={{ alignItems: "end" }}>
          <div className="field">
            <label htmlFor={`sd-ev-title-${i}`}>Titre</label>
            <input id={`sd-ev-title-${i}`} className="input" maxLength={120} value={ev.title} onChange={(e) => set("events", fields.events.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
          </div>
          <div className="field">
            <label htmlFor={`sd-ev-date-${i}`}>Date</label>
            <input id={`sd-ev-date-${i}`} type="date" className="input" value={ev.date} onChange={(e) => set("events", fields.events.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} />
          </div>
          <div className="field">
            <label htmlFor={`sd-ev-desc-${i}`}>Précision</label>
            <input id={`sd-ev-desc-${i}`} className="input" maxLength={500} value={ev.description} onChange={(e) => set("events", fields.events.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
          </div>
          <div className="field">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => set("events", fields.events.filter((_, j) => j !== i))} aria-label={`Retirer l'événement ${ev.title || i + 1}`}>
              <Trash2 size={15} /> Retirer
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="btn btn-outline btn-sm" onClick={() => set("events", [...fields.events, { title: "", date: "", description: "" }])}>
        <Plus size={15} /> Ajouter un événement
      </button>

      <h2 className="form-section" style={{ marginTop: 18 }}>
        Documents à télécharger
      </h2>
      {fields.downloads.map((d, i) => (
        <div className="form-grid" key={i} style={{ alignItems: "end" }}>
          <div className="field">
            <label htmlFor={`sd-dl-label-${i}`}>Intitulé</label>
            <input id={`sd-dl-label-${i}`} className="input" maxLength={120} value={d.label} onChange={(e) => set("downloads", fields.downloads.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
          </div>
          <div className="field">
            <label htmlFor={`sd-dl-url-${i}`}>Adresse du document (https://…)</label>
            <input id={`sd-dl-url-${i}`} type="url" className="input" value={d.url} onChange={(e) => set("downloads", fields.downloads.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
          </div>
          <div className="field">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => set("downloads", fields.downloads.filter((_, j) => j !== i))} aria-label={`Retirer le document ${d.label || i + 1}`}>
              <Trash2 size={15} /> Retirer
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="btn btn-outline btn-sm" onClick={() => set("downloads", [...fields.downloads, { label: "", url: "" }])}>
        <Plus size={15} /> Ajouter un document
      </button>

      <div style={{ display: "flex", gap: 8, marginTop: 22, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-secondary" onClick={save} disabled={busy}>
          <Save size={16} /> Enregistrer le brouillon
        </button>
        {state.hasDraft && (
          <button type="button" className="btn btn-ghost" onClick={discard} disabled={busy}>
            <Undo2 size={16} /> Abandonner le brouillon
          </button>
        )}
      </div>
      <p className="field-hint" style={{ marginTop: 10 }}>
        Logo, image de couverture, photos, chiffres clés, partenaires, témoignages et actualités se gèrent depuis « Annonces &amp; vitrine » et sont publiés dès leur enregistrement.
      </p>
    </>
  );
}

export default function ShowcaseDraftPage() {
  return (
    <Shell title="Annonces & vitrine">
      <DraftContent />
    </Shell>
  );
}
