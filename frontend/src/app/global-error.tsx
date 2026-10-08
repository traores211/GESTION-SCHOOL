"use client";

import { useEffect } from "react";
import { reportError } from "../lib/report-error";

/** Last resort when the root layout itself fails: plain HTML, no dependency on the app styles. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportError(error, { digest: error.digest });
  }, [error]);

  return (
    <html lang="fr">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#fff", color: "#1b1916", display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <div style={{ maxWidth: 440, padding: 24, textAlign: "center" }}>
          <div style={{ height: 6, display: "flex", marginBottom: 24 }}>
            <span style={{ flex: 1, background: "#F77F00" }} />
            <span style={{ flex: 1, background: "#fff" }} />
            <span style={{ flex: 1, background: "#009E60" }} />
          </div>
          <h1 style={{ fontSize: 22 }}>School ERP est momentanément indisponible</h1>
          <p>L&apos;erreur a été signalée. Réessayez dans un instant.</p>
          {error.digest && <p style={{ fontSize: 12, color: "#666" }}>Référence : {error.digest}</p>}
          <button type="button" onClick={reset} style={{ padding: "10px 18px", border: 0, borderRadius: 8, background: "#F77F00", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
            Réessayer
          </button>
        </div>
      </body>
    </html>
  );
}
