"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [health, setHealth] = useState<{ status: string; timestamp: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
        const response = await fetch(`${apiUrl}/health`);
        if (!response.ok) throw new Error("API not responding");
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
    const interval = setInterval(checkHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <main style={{ padding: "40px", fontFamily: "system-ui, sans-serif" }}>
      <h1>🎓 School ERP System</h1>
      <h2>Frontend Status</h2>

      <div style={{ marginTop: "20px", padding: "20px", border: "1px solid #ddd", borderRadius: "8px" }}>
        <h3>Backend API Health Check</h3>
        {loading && <p>Checking...</p>}
        {error && <p style={{ color: "red" }}>❌ Error: {error}</p>}
        {health && (
          <div>
            <p style={{ color: "green" }}>✅ API Status: {health.status}</p>
            <p>Last check: {new Date(health.timestamp).toLocaleTimeString()}</p>
          </div>
        )}
      </div>

      <div style={{ marginTop: "20px", padding: "20px", backgroundColor: "#f5f5f5", borderRadius: "8px" }}>
        <h3>📋 Quick Links</h3>
        <ul>
          <li><a href="http://localhost:4000/api/docs">📚 API Swagger Docs</a></li>
          <li><a href="http://localhost:8025">📧 MailHog (Email Testing)</a></li>
        </ul>
      </div>

      <div style={{ marginTop: "20px", padding: "20px", backgroundColor: "#f5f5f5", borderRadius: "8px" }}>
        <h3>🔧 Configuration</h3>
        <ul>
          <li>API URL: {process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api"}</li>
          <li>Environment: {process.env.NODE_ENV || "development"}</li>
        </ul>
      </div>
    </main>
  );
}
