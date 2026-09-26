"use client";

import { useEffect, useState } from "react";
import Shell from "../../components/Shell";
import { api, errorMessage } from "../../lib/api";
import { useSession } from "../../lib/session";
import { EmptyState, ErrorAlert, SkeletonRows, useToast } from "../../components/ui/States";

interface Item {
  title?: string;
  text?: string;
  imageUrl?: string;
  url?: string;
  date?: string;
}
interface Section {
  type: string;
  enabled: boolean;
  title?: string;
  content?: string;
  items?: Item[];
}
interface Settings {
  name: string;
  code: string;
  email: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  directeur: string | null;
  tagline: string | null;
  description: string | null;
  website: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  fontFamily: string | null;
  footerText: string | null;
  signatureUrl: string | null;
  stampUrl: string | null;
  socialLinks: Record<string, string> | null;
  showcasePublished: boolean;
  showcaseSections: Section[];
  seoTitle: string | null;
  seoDescription: string | null;
}

const SECTION_LABELS: Record<string, string> = {
  hero: "Bandeau d'accueil",
  about: "Présentation",
  director: "Mot du directeur",
  history: "Historique",
  values: "Valeurs",
  levels: "Niveaux et formations",
  team: "Équipe",
  gallery: "Galerie photos",
  news: "Actualités",
  events: "Agenda / événements",
  documents: "Documents à télécharger",
  admissions: "Préinscription",
  contact: "Contact et localisation",
};
const WITH_ITEMS = ["values", "team", "gallery", "events", "documents", "history"];

/** WCAG contrast with white, computed client side to guide the choice (the server enforces it). */
function contrastWithWhite(hex: string) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (l + 0.05);
}

export default function SettingsPage() {
  const { refresh } = useSession();
  const toast = useToast();
  const [tab, setTab] = useState<"identity" | "showcase" | "messages">("identity");
  const [s, setS] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ id: string; name: string; email: string; phone: string | null; message: string; handled: boolean; createdAt: string }[]>([]);
  const [outbox, setOutbox] = useState<{ id: string; channel: string; to: string; subject: string | null; status: string; createdAt: string }[]>([]);

  const load = () => {
    setError(null);
    api.get<Settings>("/school/settings").then(setS).catch((err) => setError(errorMessage(err)));
    api.get<typeof messages>("/school/contact-messages").then(setMessages).catch(() => {});
    api.get<typeof outbox>("/school/outbox").then(setOutbox).catch(() => {});
  };
  useEffect(load, []);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((prev) => (prev ? { ...prev, [k]: v } : prev));
  const setSection = (i: number, patch: Partial<Section>) => set("showcaseSections", s!.showcaseSections.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: -1 | 1) => {
    const list = [...s!.showcaseSections];
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    set("showcaseSections", list);
  };

  const save = async () => {
    if (!s) return;
    setSaving(true);
    setError(null);
    const clean = (v: string | null) => (v === null || v === "" ? undefined : v);
    try {
      await api.patch("/school/settings", {
        name: s.name,
        email: s.email,
        phone: clean(s.phone),
        address: clean(s.address),
        city: clean(s.city),
        directeur: clean(s.directeur),
        tagline: clean(s.tagline),
        description: clean(s.description),
        website: clean(s.website),
        logoUrl: clean(s.logoUrl),
        faviconUrl: clean(s.faviconUrl),
        primaryColor: clean(s.primaryColor),
        secondaryColor: clean(s.secondaryColor),
        footerText: clean(s.footerText),
        signatureUrl: clean(s.signatureUrl),
        stampUrl: clean(s.stampUrl),
        socialLinks: Object.fromEntries(Object.entries(s.socialLinks ?? {}).filter(([, v]) => v)),
        showcasePublished: s.showcasePublished,
        showcaseSections: s.showcaseSections.map((x) => ({ ...x, items: x.items?.filter((it) => it.title || it.text || it.imageUrl) })),
        seoTitle: clean(s.seoTitle),
        seoDescription: clean(s.seoDescription),
      });
      toast("Modifications enregistrées");
      refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const text = (k: keyof Settings, label: string, opts: { hint?: string; type?: string; area?: boolean; max?: number } = {}) => (
    <div className="field">
      <label htmlFor={`set-${k}`}>{label}</label>
      {opts.area ? (
        <textarea id={`set-${k}`} className="input" maxLength={opts.max} value={(s?.[k] as string) ?? ""} onChange={(e) => set(k, e.target.value as never)} />
      ) : (
        <input id={`set-${k}`} className="input" type={opts.type ?? "text"} maxLength={opts.max} value={(s?.[k] as string) ?? ""} onChange={(e) => set(k, e.target.value as never)} aria-describedby={opts.hint ? `set-${k}-hint` : undefined} />
      )}
      {opts.hint && (
        <span id={`set-${k}-hint`} className="field-hint">
          {opts.hint}
        </span>
      )}
    </div>
  );

  const ratio = s?.primaryColor ? contrastWithWhite(s.primaryColor) : 0;

  return (
    <Shell title="Vitrine et identité">
      <div className="page-header">
        <div>
          <h1>Vitrine et identité</h1>
          <p>Personnalisez l&apos;espace de votre établissement et sa page publique, sans écrire de code.</p>
        </div>
        {s && (
          <div className="row">
            <a className="btn btn-outline" href={`/ecole/${s.code}`} target="_blank" rel="noopener noreferrer">
              Voir la vitrine
            </a>
            <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        )}
      </div>

      <div className="tabs" role="tablist" aria-label="Sections des paramètres">
        {[
          ["identity", "Identité visuelle"],
          ["showcase", "Vitrine publique"],
          ["messages", `Messages (${messages.filter((m) => !m.handled).length})`],
        ].map(([k, label]) => (
          <button key={k} type="button" role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k as typeof tab)}>
            {label}
          </button>
        ))}
      </div>

      <ErrorAlert message={error} />
      {!s ? (
        <SkeletonRows rows={8} />
      ) : tab === "identity" ? (
        <div className="grid-2">
          <section className="card" aria-labelledby="id-general">
            <h2 id="id-general" className="card-title">
              Établissement
            </h2>
            {text("name", "Nom", { max: 150 })}
            {text("tagline", "Slogan", { max: 200 })}
            {text("directeur", "Directeur / directrice", { max: 150 })}
            <div className="form-grid">
              {text("email", "Email", { type: "email" })}
              {text("phone", "Téléphone", { type: "tel" })}
            </div>
            {text("address", "Adresse", { max: 300 })}
            {text("city", "Ville", { max: 100 })}
            {text("website", "Site web", { type: "url", hint: "Adresse complète commençant par https://" })}
          </section>
          <section className="card" aria-labelledby="id-brand">
            <h2 id="id-brand" className="card-title">
              Marque
            </h2>
            {text("logoUrl", "Logo (URL de l'image)", { hint: "Image carrée ou horizontale, fond transparent de préférence." })}
            {text("faviconUrl", "Icône d'onglet (URL)")}
            <div className="form-grid">
              <div className="field">
                <label htmlFor="set-primary">Couleur principale</label>
                <div className="row">
                  <input id="set-primary" type="color" value={s.primaryColor ?? "#1f5f4a"} onChange={(e) => set("primaryColor", e.target.value)} style={{ width: 48, height: 40, border: 0, background: "none" }} />
                  <code>{s.primaryColor ?? "#1f5f4a"}</code>
                </div>
                <span className={ratio >= 4.5 ? "field-hint" : "field-error"} role="status">
                  Contraste avec le texte blanc : {ratio.toFixed(1)}:1 {ratio >= 4.5 ? "— lisible (AA)" : "— trop clair, choisissez une teinte plus foncée"}
                </span>
              </div>
              <div className="field">
                <label htmlFor="set-secondary">Couleur d&apos;accent</label>
                <div className="row">
                  <input id="set-secondary" type="color" value={s.secondaryColor ?? "#b45309"} onChange={(e) => set("secondaryColor", e.target.value)} style={{ width: 48, height: 40, border: 0, background: "none" }} />
                  <code>{s.secondaryColor ?? "#b45309"}</code>
                </div>
              </div>
            </div>
            <div className="row" style={{ marginBottom: 16 }} aria-hidden="true">
              <span className="btn" style={{ background: s.primaryColor ?? "#1f5f4a", color: "#fff" }}>
                Aperçu d&apos;un bouton
              </span>
            </div>
            {text("footerText", "Mention en pied des documents", { max: 300 })}
            <div className="form-grid">
              {text("signatureUrl", "Signature (URL image)")}
              {text("stampUrl", "Cachet (URL image)")}
            </div>
          </section>
        </div>
      ) : tab === "showcase" ? (
        <div className="stack">
          <section className="card">
            <label className="toggle">
              <input type="checkbox" checked={s.showcasePublished} onChange={(e) => set("showcasePublished", e.target.checked)} />
              Vitrine publiée (visible par tous)
            </label>
            <div className="form-grid" style={{ marginTop: 16 }}>
              {text("seoTitle", "Titre pour Google et les réseaux (70 car.)", { max: 70 })}
              {text("seoDescription", "Description pour Google (170 car.)", { max: 170 })}
            </div>
            {text("description", "Texte de présentation", { area: true, max: 5000 })}
            <div className="form-grid">
              {["facebook", "instagram", "linkedin", "youtube", "whatsapp"].map((k) => (
                <div className="field" key={k}>
                  <label htmlFor={`social-${k}`}>{k === "whatsapp" ? "WhatsApp (numéro)" : k.charAt(0).toUpperCase() + k.slice(1)}</label>
                  <input id={`social-${k}`} className="input" value={s.socialLinks?.[k] ?? ""} onChange={(e) => set("socialLinks", { ...(s.socialLinks ?? {}), [k]: e.target.value })} />
                </div>
              ))}
            </div>
          </section>

          <h2>Sections de la page</h2>
          <p className="muted">Activez, ordonnez et complétez les sections. Le texte est affiché tel quel (sans HTML).</p>
          {s.showcaseSections.map((sec, i) => (
            <section key={sec.type} className="card" aria-labelledby={`sec-${sec.type}`}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h3 id={`sec-${sec.type}`}>{SECTION_LABELS[sec.type] ?? sec.type}</h3>
                <div className="row">
                  <label className="toggle">
                    <input type="checkbox" checked={sec.enabled} onChange={(e) => setSection(i, { enabled: e.target.checked })} />
                    Visible
                  </label>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Monter ${SECTION_LABELS[sec.type]}`}>
                    ↑
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(i, 1)} disabled={i === s.showcaseSections.length - 1} aria-label={`Descendre ${SECTION_LABELS[sec.type]}`}>
                    ↓
                  </button>
                </div>
              </div>
              {sec.enabled && sec.type !== "hero" && (
                <div style={{ marginTop: 12 }}>
                  <div className="field">
                    <label htmlFor={`sec-${sec.type}-title`}>Titre</label>
                    <input id={`sec-${sec.type}-title`} className="input" maxLength={120} value={sec.title ?? ""} onChange={(e) => setSection(i, { title: e.target.value })} />
                  </div>
                  {!["levels", "news", "admissions", "contact"].includes(sec.type) && (
                    <div className="field">
                      <label htmlFor={`sec-${sec.type}-content`}>Texte</label>
                      <textarea id={`sec-${sec.type}-content`} className="input" maxLength={5000} value={sec.content ?? ""} onChange={(e) => setSection(i, { content: e.target.value })} />
                    </div>
                  )}
                  {WITH_ITEMS.includes(sec.type) && (
                    <div className="stack">
                      {(sec.items ?? []).map((it, j) => (
                        <div key={j} className="form-grid" style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                          {(["title", "text", "imageUrl", "url"] as const).map((f) => (
                            <div className="field" key={f}>
                              <label htmlFor={`sec-${sec.type}-${j}-${f}`}>{{ title: "Titre", text: "Texte", imageUrl: "Image (URL)", url: "Lien (URL)" }[f]}</label>
                              <input
                                id={`sec-${sec.type}-${j}-${f}`}
                                className="input"
                                value={it[f] ?? ""}
                                onChange={(e) => setSection(i, { items: (sec.items ?? []).map((x, k) => (k === j ? { ...x, [f]: e.target.value } : x)) })}
                              />
                            </div>
                          ))}
                        </div>
                      ))}
                      <div>
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => setSection(i, { items: [...(sec.items ?? []), {}] })}>
                          Ajouter un élément
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          ))}
        </div>
      ) : (
        <div className="stack">
          <h2>Messages reçus depuis la vitrine</h2>
          {messages.length === 0 ? (
            <EmptyState title="Aucun message" text="Les messages du formulaire de contact de la vitrine apparaîtront ici." />
          ) : (
            messages.map((m) => (
              <div key={m.id} className="card">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>
                    {m.name} — <a href={`mailto:${m.email}`}>{m.email}</a> {m.phone && `· ${m.phone}`}
                  </strong>
                  <span className="muted">{new Date(m.createdAt).toLocaleString("fr-FR")}</span>
                </div>
                <p style={{ whiteSpace: "pre-wrap", margin: "8px 0" }}>{m.message}</p>
                {m.handled ? (
                  <span className="badge badge-green">Traité</span>
                ) : (
                  <button type="button" className="btn btn-outline btn-sm" onClick={async () => { await api.patch(`/school/contact-messages/${m.id}/handled`); load(); }}>
                    Marquer comme traité
                  </button>
                )}
              </div>
            ))
          )}
          <h2 style={{ marginTop: 16 }}>Emails et SMS envoyés</h2>
          <div className="table-wrap responsive">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Canal</th>
                  <th>Destinataire</th>
                  <th>Objet</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {outbox.map((o) => (
                  <tr key={o.id}>
                    <td data-label="Date">{new Date(o.createdAt).toLocaleString("fr-FR")}</td>
                    <td data-label="Canal">{o.channel}</td>
                    <td data-label="Destinataire">{o.to}</td>
                    <td data-label="Objet">{o.subject ?? "—"}</td>
                    <td data-label="Statut">
                      <span className={`badge ${o.status === "SENT" ? "badge-green" : o.status === "FAILED" ? "badge-danger" : "badge-neutral"}`}>{o.status === "SENT" ? "Envoyé" : o.status === "FAILED" ? "Échec" : "En file"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Shell>
  );
}
