"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "../../lib/api";
import { setSession } from "../../lib/auth";

interface LoginResponse {
  accessToken: string;
  user: { id: string; email: string; firstName: string; lastName: string; role: string };
}

const DEMO_ACCOUNTS = [
  { role: "Direction", email: "admin@school.local", password: "admin123" },
  { role: "Enseignant", email: "k.kouassi@school.local", password: "teach123" },
  { role: "Secrétariat", email: "secretaire@school.local", password: "secret123" },
  { role: "Parent", email: "parent@school.local", password: "parent123" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@school.local");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await api.post<LoginResponse>("/auth/login", { email, password });
      setSession(data.accessToken, data.user);
      router.push(data.user.role === "PARENT" ? "/portal" : "/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "linear-gradient(135deg, var(--ci-green-dark) 0%, var(--ci-green) 45%, #ffffff 45%, #ffffff 55%, var(--ci-orange) 55%, var(--ci-orange-dark) 100%)",
        padding: 20,
      }}
    >
      <div
        className="card"
        style={{ width: "100%", maxWidth: 420, boxShadow: "var(--shadow-md)" }}
      >
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "var(--ci-orange)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
              margin: "0 auto 12px",
            }}
          >
            🎓
          </div>
          <h1 style={{ fontSize: 20 }}>School ERP</h1>
          <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>
            Gestion scolaire — Côte d&apos;Ivoire
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">Adresse email</label>
            <input
              id="email"
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Mot de passe</label>
            <input
              id="password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <p className="text-danger" style={{ fontSize: 13, marginBottom: 12 }}>
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>

        <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid var(--border)" }}>
          <p style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase" }}>
            Comptes de démonstration
          </p>
          <div style={{ display: "grid", gap: 6 }}>
            {DEMO_ACCOUNTS.map((acc) => (
              <button
                key={acc.email}
                type="button"
                className="btn btn-outline btn-sm"
                style={{ justifyContent: "space-between" }}
                onClick={() => {
                  setEmail(acc.email);
                  setPassword(acc.password);
                }}
              >
                <span>{acc.role}</span>
                <span className="muted">{acc.email}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
