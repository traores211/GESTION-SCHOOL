"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "../../../lib/api";

interface Showcase {
  name: string;
  code: string;
  tagline: string | null;
  description: string | null;
  city: string | null;
  address: string | null;
  email: string;
  phone: string | null;
  website: string | null;
  levels: string[];
  studentsCount: number;
  announcements: { id: string; title: string; content: string; publishedAt: string }[];
}

export default function SchoolShowcasePage() {
  const params = useParams<{ code: string }>();
  const [data, setData] = useState<Showcase | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params?.code) return;
    api
      .get<Showcase>(`/public/schools/${params.code}/showcase`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Établissement introuvable"));
  }, [params?.code]);

  if (error) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p className="text-danger">{error}</p>
      </main>
    );
  }

  if (!data) return null;

  return (
    <main style={{ minHeight: "100vh" }}>
      {/* Hero */}
      <section
        style={{
          background: "linear-gradient(135deg, var(--ci-green-dark) 0%, var(--ci-green) 55%, var(--ci-orange) 130%)",
          color: "#fff",
          padding: "72px 24px",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ fontSize: 46, marginBottom: 8 }}>🎓</div>
          <h1 style={{ fontSize: 34, color: "#fff" }}>{data.name}</h1>
          <p style={{ fontSize: 17, opacity: 0.95, marginTop: 10 }}>
            {data.tagline || "Un enseignement de qualité, au service de la réussite de chaque élève."}
          </p>
          <div style={{ marginTop: 28, display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href={`/ecole/${data.code}/inscription`} className="btn" style={{ background: "#fff", color: "var(--ci-green-dark)" }}>
              📝 Faire une demande d&apos;admission
            </Link>
            <a href={`mailto:${data.email}`} className="btn btn-outline" style={{ borderColor: "#fff", color: "#fff" }}>
              ✉️ Nous contacter
            </a>
          </div>
        </div>
      </section>

      <div className="flag-stripe" />

      {/* Stats */}
      <section style={{ padding: "40px 24px", maxWidth: 960, margin: "0 auto" }}>
        <div className="kpi-grid">
          <div className="kpi-card" style={{ textAlign: "center" }}>
            <div className="kpi-value">{data.studentsCount}+</div>
            <div className="kpi-sub">Élèves accompagnés</div>
          </div>
          <div className="kpi-card accent-orange" style={{ textAlign: "center" }}>
            <div className="kpi-value">{data.levels.length}</div>
            <div className="kpi-sub">Niveaux d&apos;enseignement</div>
          </div>
          <div className="kpi-card" style={{ textAlign: "center" }}>
            <div className="kpi-value">🇨🇮</div>
            <div className="kpi-sub">{data.city || "Côte d'Ivoire"}</div>
          </div>
        </div>
      </section>

      {/* Levels */}
      {data.levels.length > 0 && (
        <section style={{ padding: "0 24px 40px", maxWidth: 960, margin: "0 auto" }}>
          <h2 style={{ fontSize: 20, marginBottom: 14 }}>📚 Nos niveaux</h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {data.levels.map((lvl) => (
              <span key={lvl} className="badge badge-green" style={{ fontSize: 13, padding: "8px 16px" }}>
                {lvl}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Description */}
      {data.description && (
        <section style={{ padding: "0 24px 40px", maxWidth: 960, margin: "0 auto" }}>
          <div className="card">
            <h2 style={{ fontSize: 20, marginBottom: 12 }}>🏫 Notre établissement</h2>
            <p style={{ lineHeight: 1.7 }}>{data.description}</p>
          </div>
        </section>
      )}

      {/* News */}
      <section style={{ padding: "0 24px 40px", maxWidth: 960, margin: "0 auto" }}>
        <h2 style={{ fontSize: 20, marginBottom: 14 }}>📰 Actualités</h2>
        {data.announcements.length === 0 && <p className="muted">Aucune actualité publiée pour le moment.</p>}
        <div style={{ display: "grid", gap: 12 }}>
          {data.announcements.map((a) => (
            <div key={a.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <strong>{a.title}</strong>
                <span className="muted" style={{ fontSize: 12 }}>{new Date(a.publishedAt).toLocaleDateString("fr-FR")}</span>
              </div>
              <p style={{ marginTop: 8, color: "var(--text-muted)" }}>{a.content}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Contact */}
      <section style={{ background: "var(--ci-green-light)", padding: "40px 24px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontSize: 20, marginBottom: 12 }}>📍 Nous contacter</h2>
          <p className="muted">{data.address}{data.address && data.city ? ", " : ""}{data.city}</p>
          <p className="muted">{data.email}{data.phone ? ` — ${data.phone}` : ""}</p>
          <Link href={`/ecole/${data.code}/inscription`} className="btn btn-primary" style={{ marginTop: 18 }}>
            Faire une demande d&apos;admission
          </Link>
        </div>
      </section>

      <footer style={{ padding: 20, textAlign: "center" }}>
        <p className="muted" style={{ fontSize: 12 }}>
          <Link href="/login">Espace établissement (connexion) →</Link>
        </p>
      </footer>
    </main>
  );
}
