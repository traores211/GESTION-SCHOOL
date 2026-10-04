"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import Shell from "../../components/Shell";
import ImageField from "../../components/showcase/ImageField";
import CollectionEditor from "../../components/showcase/CollectionEditor";
import { FormError, Modal, useFeedback } from "../../components/ui";
import { api, ApiError } from "../../lib/api";
import { ShowcaseAdminData, ShowcaseSettings } from "../../lib/showcase";

interface Announcement {
  id: string;
  title: string;
  content: string;
  imageUrl: string | null;
  isPublished: boolean;
  publishedAt: string;
}

type Tab = "news" | "identity" | "highlights" | "photos" | "partners" | "testimonials";

const TABS: { id: Tab; label: string }[] = [
  { id: "news", label: "Actualités" },
  { id: "identity", label: "Identité & contacts" },
  { id: "highlights", label: "Chiffres clés" },
  { id: "photos", label: "Galerie" },
  { id: "partners", label: "Partenaires" },
  { id: "testimonials", label: "Témoignages" },
];

function errorText(err: unknown) {
  return err instanceof ApiError ? err.message : "Une erreur est survenue.";
}

export default function AnnouncementsPage() {
  const [tab, setTab] = useState<Tab>("news");
  const [showcase, setShowcase] = useState<ShowcaseAdminData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadShowcase = useCallback(() => {
    api
      .get<ShowcaseAdminData>("/showcase/settings")
      .then((d) => {
        setShowcase(d);
        setLoadError(null);
      })
      .catch((err) => setLoadError(errorText(err)));
  }, []);

  useEffect(loadShowcase, [loadShowcase]);

  const code = showcase?.school.code;

  return (
    <Shell title="Annonces & Vitrine">
      <div className="page-header">
        <div>
          <h1>Annonces &amp; vitrine publique</h1>
          <p>
            <a href="/announcements/draft">Préparer un brouillon, le prévisualiser puis le publier →</a>
          </p>
          <p>Contenu du site public de l&apos;établissement, accessible sans compte</p>
        </div>
        {code && (
          <a href={`/ecole/${code}`} target="_blank" rel="noreferrer" className="btn btn-secondary">
            Voir la vitrine ↗
          </a>
        )}
      </div>

      {loadError && (
        <div className="alert alert-danger" role="alert" style={{ marginBottom: 16 }}>
          <span className="alert-icon" aria-hidden="true">
            <AlertTriangle size={16} />
          </span>
          <span>
            {loadError}{" "}
            <button className="btn btn-outline btn-sm" onClick={loadShowcase} style={{ marginLeft: 8 }}>
              Réessayer
            </button>
          </span>
        </div>
      )}

      <div className="tabs" role="tablist" style={{ overflowX: "auto" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`tab${tab === t.id ? " active" : ""}`}
            style={{ background: "none", borderTop: "none", borderLeft: "none", borderRight: "none", whiteSpace: "nowrap" }}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {showcase && t.id !== "news" && t.id !== "identity" && (
              <span className="badge badge-neutral" style={{ marginLeft: 6 }}>
                {showcase[t.id].length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "news" && <NewsTab />}

      {tab !== "news" && !showcase && !loadError && <div className="skeleton" style={{ height: 240 }} />}

      {tab === "identity" && showcase && <IdentityTab initial={showcase.school} onSaved={loadShowcase} />}

      {tab === "highlights" && showcase && (
        <>
          <p className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
            Les effectifs, le nombre de classes et de niveaux sont calculés automatiquement. Ajoutez ici vos autres chiffres
            (résultats aux examens, etc.) — 6 chiffres au maximum sont affichés.
          </p>
          <CollectionEditor
            collection="highlights"
            items={showcase.highlights}
            itemLabel="un chiffre clé"
            emptyText="Aucun chiffre clé personnalisé"
            onChanged={loadShowcase}
            fields={[
              { key: "value", label: "Valeur", type: "text", required: true, maxLength: 20, placeholder: "94 %" },
              { key: "label", label: "Libellé", type: "text", required: true, maxLength: 80, placeholder: "de réussite au BAC 2025" },
            ]}
            renderItem={(h) => (
              <div>
                <strong style={{ fontSize: 20, color: "var(--brand-strong)" }}>{h.value}</strong>{" "}
                <span className="muted">{h.label}</span>
              </div>
            )}
          />
        </>
      )}

      {tab === "photos" && showcase && (
        <CollectionEditor
          collection="photos"
          layout="grid"
          items={showcase.photos}
          itemLabel="une photo"
          emptyText="Aucune photo dans la galerie"
          onChanged={loadShowcase}
          fields={[
            { key: "url", label: "Photo", type: "image", required: true, hint: "JPEG, PNG, WebP ou GIF — 5 Mo max. La 1re photo illustre aussi la présentation." },
            { key: "caption", label: "Légende", type: "text", maxLength: 160 },
          ]}
          renderItem={(p) => (
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={api.mediaUrl(p.url) || ""}
                alt={p.caption || ""}
                style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", borderRadius: 8, display: "block" }}
              />
              <p style={{ fontSize: 13, marginTop: 6 }}>{p.caption || <span className="muted">Sans légende</span>}</p>
            </div>
          )}
        />
      )}

      {tab === "partners" && showcase && (
        <CollectionEditor
          collection="partners"
          items={showcase.partners}
          itemLabel="un partenaire"
          emptyText="Aucun partenaire"
          onChanged={loadShowcase}
          fields={[
            { key: "name", label: "Nom", type: "text", required: true, maxLength: 120 },
            { key: "logoUrl", label: "Logo", type: "image" },
            { key: "website", label: "Site web", type: "url", placeholder: "https://…" },
          ]}
          renderItem={(p) => (
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              {p.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={api.mediaUrl(p.logoUrl) || ""} alt="" style={{ width: 56, height: 40, objectFit: "contain" }} />
              ) : (
                <span className="badge badge-neutral">Sans logo</span>
              )}
              <div>
                <strong>{p.name}</strong>
                {p.website && <div className="muted" style={{ fontSize: 12 }}>{p.website}</div>}
              </div>
            </div>
          )}
        />
      )}

      {tab === "testimonials" && showcase && (
        <CollectionEditor
          collection="testimonials"
          items={showcase.testimonials}
          itemLabel="un témoignage"
          emptyText="Aucun témoignage"
          onChanged={loadShowcase}
          fields={[
            { key: "authorName", label: "Auteur", type: "text", required: true, maxLength: 120 },
            { key: "authorRole", label: "Qualité", type: "text", maxLength: 120, placeholder: "Parent d'élève, ancien élève…" },
            { key: "content", label: "Témoignage", type: "textarea", required: true, maxLength: 1000 },
            { key: "photoUrl", label: "Photo (facultatif)", type: "image" },
            { key: "isPublished", label: "Publié sur la vitrine", type: "checkbox" },
          ]}
          renderItem={(t) => (
            <div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <strong>{t.authorName}</strong>
                {t.authorRole && <span className="muted" style={{ fontSize: 12.5 }}>{t.authorRole}</span>}
                <span className={`badge ${t.isPublished ? "badge-green" : "badge-neutral"}`}>{t.isPublished ? "Publié" : "Masqué"}</span>
              </div>
              <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                « {t.content.length > 140 ? `${t.content.slice(0, 140)}…` : t.content} »
              </p>
            </div>
          )}
        />
      )}
    </Shell>
  );
}

function IdentityTab({ initial, onSaved }: { initial: ShowcaseSettings; onSaved: () => void }) {
  const [form, setForm] = useState<ShowcaseSettings>(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const set = <K extends keyof ShowcaseSettings>(key: K, value: ShowcaseSettings[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setMessage(null);
  };
  const text = (key: keyof ShowcaseSettings) => ({
    id: `s-${key}`,
    className: "input",
    value: (form[key] as string | null) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key, e.target.value as never),
  });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const clean = (v: string | null) => (v && v.trim() ? v.trim() : null);
    try {
      await api.patch("/showcase/settings", {
        tagline: clean(form.tagline),
        description: clean(form.description),
        address: clean(form.address),
        city: clean(form.city),
        phone: clean(form.phone),
        whatsappNumber: clean(form.whatsappNumber),
        foundedYear: form.foundedYear ? Number(form.foundedYear) : null,
        logoUrl: clean(form.logoUrl),
        coverImageUrl: clean(form.coverImageUrl),
        website: clean(form.website),
        mapUrl: clean(form.mapUrl),
        facebookUrl: clean(form.facebookUrl),
        instagramUrl: clean(form.instagramUrl),
        linkedinUrl: clean(form.linkedinUrl),
        youtubeUrl: clean(form.youtubeUrl),
      });
      setMessage({ type: "success", text: "Vitrine mise à jour." });
      onSaved();
    } catch (err) {
      setMessage({ type: "error", text: errorText(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} style={{ display: "grid", gap: 16 }}>
      <div className="card">
        <h2 style={{ fontSize: 15, marginBottom: 14 }}>Identité</h2>
        <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
          {form.name} · code {form.code} · {form.email}
        </p>
        <div className="form-grid">
          <ImageField id="s-logo" label="Logo" value={form.logoUrl} onChange={(v) => set("logoUrl", v)} hint="Format carré conseillé." />
          <ImageField
            id="s-cover"
            label="Image d'en-tête"
            value={form.coverImageUrl}
            onChange={(v) => set("coverImageUrl", v)}
            hint="Paysage, 1600 px de large conseillé."
          />
        </div>
        <div className="field">
          <label htmlFor="s-tagline">Accroche</label>
          <input {...text("tagline")} maxLength={160} placeholder="Une phrase qui résume l'établissement" />
        </div>
        <div className="field">
          <label htmlFor="s-description">Présentation</label>
          <textarea {...text("description")} rows={6} maxLength={4000} />
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="s-foundedYear">Année de création</label>
            <input
              id="s-foundedYear"
              className="input"
              type="number"
              min={1800}
              max={new Date().getFullYear()}
              value={form.foundedYear ?? ""}
              onChange={(e) => set("foundedYear", e.target.value ? Number(e.target.value) : null)}
            />
          </div>
          <div className="field">
            <label htmlFor="s-website">Site web officiel</label>
            <input {...text("website")} type="url" placeholder="https://…" />
          </div>
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 15, marginBottom: 14 }}>Coordonnées</h2>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="s-address">Adresse</label>
            <input {...text("address")} maxLength={300} />
          </div>
          <div className="field">
            <label htmlFor="s-city">Ville</label>
            <input {...text("city")} maxLength={100} />
          </div>
          <div className="field">
            <label htmlFor="s-phone">Téléphone</label>
            <input {...text("phone")} maxLength={40} />
          </div>
          <div className="field">
            <label htmlFor="s-whatsappNumber">WhatsApp</label>
            <input {...text("whatsappNumber")} maxLength={40} placeholder="+225 07 00 00 00 00" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="s-mapUrl">Lien de localisation (Google Maps…)</label>
          <input {...text("mapUrl")} type="url" placeholder="https://maps.google.com/…" />
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 15, marginBottom: 14 }}>Réseaux sociaux</h2>
        <div className="form-grid">
          {(
            [
              ["facebookUrl", "Facebook"],
              ["instagramUrl", "Instagram"],
              ["linkedinUrl", "LinkedIn"],
              ["youtubeUrl", "YouTube"],
            ] as const
          ).map(([key, label]) => (
            <div className="field" key={key}>
              <label htmlFor={`s-${key}`}>{label}</label>
              <input {...text(key)} type="url" placeholder="https://…" />
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "flex-end" }}>
        {message && (
          <span className={message.type === "success" ? "text-green" : "text-danger"} role="status" style={{ fontSize: 13.5 }}>
            {message.type === "success" ? <Check size={15} aria-hidden="true" /> : <AlertTriangle size={15} aria-hidden="true" />}{" "}
            {message.text}
          </span>
        )}
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}

function NewsTab() {
  const feedback = useFeedback();
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<Announcement> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api
      .get<Announcement[]>("/announcements")
      .then(setItems)
      .catch((err) => setError(errorText(err)));
  }, []);

  useEffect(load, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError(null);
    const payload = { title: editing.title, content: editing.content, imageUrl: editing.imageUrl || null };
    try {
      if (editing.id) await api.patch(`/announcements/${editing.id}`, payload);
      else await api.post("/announcements", payload);
      setEditing(null);
      load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (a: Announcement) => {
    try {
      await api.patch(`/announcements/${a.id}`, { isPublished: !a.isPublished });
      feedback.success(a.isPublished ? "Annonce retirée de la vitrine" : "Annonce publiée", a.title);
      load();
    } catch (err) {
      feedback.error("Action impossible", errorText(err));
    }
  };

  const remove = async (id: string) => {
    const item = items?.find((a) => a.id === id);
    const ok = await feedback.confirm({
      title: "Supprimer cette annonce ?",
      message: item ? `« ${item.title} » sera définitivement supprimée${item.isPublished ? " et retirée de la vitrine publique" : ""}.` : undefined,
      confirmLabel: "Supprimer",
    });
    if (!ok) return;
    try {
      await api.delete(`/announcements/${id}`);
      feedback.success("Annonce supprimée");
      load();
    } catch (err) {
      feedback.error("Suppression impossible", errorText(err));
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <p className="muted" style={{ fontSize: 13 }}>
          Les actualités publiées apparaissent sur la vitrine ; la plus récente est affichée « À la une ».
        </p>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing({ title: "", content: "", imageUrl: null })}>
          + Nouvelle annonce
        </button>
      </div>

      {error && !editing && <p className="text-danger" style={{ marginBottom: 12 }}>{error}</p>}

      {items === null ? (
        <div className="skeleton" style={{ height: 200 }} />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Titre</th>
                <th>Publié le</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <td>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      {a.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={api.mediaUrl(a.imageUrl) || ""} alt="" style={{ width: 48, height: 36, objectFit: "cover", borderRadius: 6 }} />
                      )}
                      <div>
                        <strong>{a.title}</strong>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {a.content.slice(0, 80)}
                          {a.content.length > 80 ? "…" : ""}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="nowrap">{new Date(a.publishedAt).toLocaleDateString("fr-FR")}</td>
                  <td>
                    <span className={`badge ${a.isPublished ? "badge-green" : "badge-neutral"}`}>{a.isPublished ? "Publié" : "Brouillon"}</span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                      <button className="btn btn-outline btn-sm" onClick={() => setEditing(a)}>
                        Modifier
                      </button>
                      <button className="btn btn-outline btn-sm" onClick={() => togglePublish(a)}>
                        {a.isPublished ? "Dépublier" : "Publier"}
                      </button>
                      <button className="btn btn-outline btn-sm" style={{ color: "var(--danger)" }} onClick={() => remove(a.id)}>
                        Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && <div className="empty-state">Aucune annonce.</div>}
        </div>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        busy={saving}
        title={editing ? <>{editing.id ? "Modifier l'annonce" : "Nouvelle annonce"}</> : ""}
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setEditing(null)} disabled={saving}>
              Annuler
            </button>
            <button type="submit" form="news-form" className="btn btn-primary" disabled={saving}>
              {saving ? "Enregistrement…" : editing?.id ? "Enregistrer" : "Publier"}
            </button>
          </>
        }
      >
        {editing && (
          <form id="news-form" onSubmit={save}>
            <FormError message={error} />
              <div className="field">
                <label htmlFor="n-title">Titre</label>
                <input id="n-title" className="input" required value={editing.title || ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="n-content">Contenu</label>
                <textarea
                  id="n-content"
                  className="input"
                  required
                  rows={6}
                  value={editing.content || ""}
                  onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                />
              </div>
              <ImageField id="n-image" label="Image (facultatif)" value={editing.imageUrl ?? null} onChange={(v) => setEditing({ ...editing, imageUrl: v })} />
          </form>
        )}
      </Modal>
    </div>
  );
}
