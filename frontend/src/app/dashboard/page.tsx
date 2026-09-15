"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Me {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  lastLogin: string | null;
  school: { id: string; name: string } | null;
}

export default function DashboardPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("schoolerp_token");
    if (!token) {
      router.push("/login");
      return;
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
    fetch(`${apiUrl}/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Session expirée");
        return res.json();
      })
      .then(setMe)
      .catch((err) => {
        setError(err.message);
        localStorage.removeItem("schoolerp_token");
        localStorage.removeItem("schoolerp_user");
        setTimeout(() => router.push("/login"), 1500);
      });
  }, [router]);

  const logout = () => {
    localStorage.removeItem("schoolerp_token");
    localStorage.removeItem("schoolerp_user");
    router.push("/login");
  };

  return (
    <main style={{ padding: 40, fontFamily: "system-ui, sans-serif" }}>
      <h1>🎓 Tableau de bord</h1>
      {error && <p style={{ color: "red" }}>{error}</p>}
      {me && (
        <div style={{ marginTop: 20, padding: 20, border: "1px solid #ddd", borderRadius: 8, maxWidth: 500 }}>
          <p><strong>Nom :</strong> {me.firstName} {me.lastName}</p>
          <p><strong>Email :</strong> {me.email}</p>
          <p><strong>Rôle :</strong> {me.role}</p>
          <p><strong>Statut :</strong> {me.status}</p>
          {me.school && <p><strong>École :</strong> {me.school.name}</p>}
          {me.lastLogin && <p><strong>Dernière connexion :</strong> {new Date(me.lastLogin).toLocaleString()}</p>}
        </div>
      )}
      <button onClick={logout} style={{ marginTop: 20 }}>Se déconnecter</button>
    </main>
  );
}
