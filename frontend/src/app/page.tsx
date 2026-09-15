"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function Home() {
  const [health, setHealth] = useState<{ status: string; timestamp: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
        const response = await fetch(`${apiUrl}/health`);
        if (!response.ok) throw new Error("API indisponible");
        const data = await response.json();
        setHealth(data);
        setError(null);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <div className="flag-stripe" />
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 560, width: "100%", textAlign: "center" }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              background: "var(--ci-orange)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 36,
              margin: "0 auto 18px",
              boxShadow: "var(--shadow-md)",
            }}
          >
            🎓
          </div>
          <h1 style={{ fontSize: 30 }}>School ERP</h1>
          <p className="muted" style={{ marginTop: 8, fontSize: 15 }}>
            La plateforme numérique de gestion scolaire pour la Côte d&apos;Ivoire
          </p>

          <div style={{ marginTop: 28, display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/login" className="btn btn-primary">
              🔐 Se connecter
            </Link>
            <Link href="/ecole/DEMO-001" className="btn btn-secondary">
              🌐 Voir la vitrine de l&apos;école
            </Link>
            <a href="http://localhost:4000/api/docs" className="btn btn-outline">
              📚 API Docs
            </a>
          </div>

          <div className="card" style={{ marginTop: 32, textAlign: "left" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>État du serveur API</span>
              {loading && <span className="badge badge-neutral">Vérification…</span>}
              {!loading && health && <span className="badge badge-green">● En ligne</span>}
              {!loading && error && <span className="badge badge-danger">● Hors ligne</span>}
            </div>
            {health && (
              <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Dernière vérification : {new Date(health.timestamp).toLocaleTimeString("fr-FR")}
              </p>
            )}
            {error && (
              <p className="text-danger" style={{ fontSize: 12, marginTop: 6 }}>
                {error}
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
