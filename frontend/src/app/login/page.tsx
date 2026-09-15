"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@school.local");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const response = await fetch(`${apiUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message || "Identifiants invalides");
      }
      const data = await response.json();
      localStorage.setItem("schoolerp_token", data.accessToken);
      localStorage.setItem("schoolerp_user", JSON.stringify(data.user));
      router.push("/dashboard");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ maxWidth: 400, margin: "80px auto", padding: "0 20px", fontFamily: "system-ui, sans-serif" }}>
      <h1>🎓 School ERP</h1>
      <h2>Connexion</h2>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 20 }}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: "100%", padding: 8, marginTop: 4 }}
          />
        </label>
        <label>
          Mot de passe
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: "100%", padding: 8, marginTop: 4 }}
          />
        </label>
        {error && <p style={{ color: "red" }}>{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? "Connexion..." : "Se connecter"}
        </button>
      </form>
      <p style={{ marginTop: 20, fontSize: 13, color: "#666" }}>
        Compte de démo : admin@school.local / admin123
      </p>
    </main>
  );
}
