"use client";

import { useEffect, useState } from "react";
import Shell from "../../components/Shell";
import { api, ApiError } from "../../lib/api";

interface Announcement {
  id: string;
  title: string;
  content: string;
  isPublished: boolean;
  publishedAt: string;
}

export default function AnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", content: "" });
  const [schoolCode, setSchoolCode] = useState("DEMO-001");

  const load = () => {
    api.get<Announcement[]>("/announcements").then(setItems).catch((err) => setError(err instanceof ApiError ? err.message : "Erreur"));
  };

  useEffect(load, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/announcements", form);
      setShowForm(false);
      setForm({ title: "", content: "" });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (a: Announcement) => {
    await api.patch(`/announcements/${a.id}`, { isPublished: !a.isPublished });
    load();
  };

  const remove = async (id: string) => {
    await api.delete(`/announcements/${id}`);
    load();
  };

  const showcaseUrl = typeof window !== "undefined" ? `${window.location.origin}/ecole/${schoolCode}` : "";

  return (
    <Shell title="Annonces & Vitrine">
      <div className="page-header">
        <div>
          <h1>📢 Annonces & Vitrine publique</h1>
          <p>Les actualités publiées apparaissent sur le site public de l&apos;établissement</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Nouvelle annonce</button>
      </div>

      <div className="card" style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <p style={{ fontWeight: 700, fontSize: 13 }}>🌐 Site vitrine public</p>
          <p className="muted" style={{ fontSize: 12.5 }}>Page de présentation accessible sans compte, avec formulaire de candidature en ligne.</p>
        </div>
        <a href={`/ecole/${schoolCode}`} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
          Voir la vitrine ↗
        </a>
      </div>

      {error && <p className="text-danger">{error}</p>}

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
                  <strong>{a.title}</strong>
                  <div className="muted" style={{ fontSize: 12 }}>{a.content.slice(0, 80)}{a.content.length > 80 ? "…" : ""}</div>
                </td>
                <td>{new Date(a.publishedAt).toLocaleDateString("fr-FR")}</td>
                <td>
                  <span className={`badge ${a.isPublished ? "badge-green" : "badge-neutral"}`}>
                    {a.isPublished ? "Publié" : "Brouillon"}
                  </span>
                </td>
                <td style={{ display: "flex", gap: 6 }}>
                  <button className="btn btn-outline btn-sm" onClick={() => togglePublish(a)}>
                    {a.isPublished ? "Dépublier" : "Publier"}
                  </button>
                  <button className="btn btn-outline btn-sm" onClick={() => remove(a.id)}>Supprimer</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <div className="empty-state">Aucune annonce.</div>}
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 17, marginBottom: 16 }}>Nouvelle annonce</h2>
            <form onSubmit={create}>
              <div className="field">
                <label>Titre</label>
                <input className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="field">
                <label>Contenu</label>
                <textarea className="input" required rows={5} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Publication…" : "Publier"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Shell>
  );
}
