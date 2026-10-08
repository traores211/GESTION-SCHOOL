"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { BrandMark, FlagBand } from "../components/Brand";
import { reportError } from "../lib/report-error";

/** Shown when a page crashes: the error is reported, the user can retry or go back. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportError(error, { digest: error.digest });
  }, [error]);

  return (
    <main className="status-page">
      <FlagBand />
      <div className="status-card">
        <BrandMark size={34} />
        <p className="status-code">Oups</p>
        <h1>Cette page a rencontré un problème</h1>
        <p>L&apos;erreur a été signalée automatiquement à l&apos;équipe technique. Vos données enregistrées ne sont pas perdues.</p>
        {error.digest && <p className="status-ref">Référence : {error.digest}</p>}
        <div className="btn-row" style={{ justifyContent: "center" }}>
          <button type="button" className="btn btn-primary" onClick={reset}>
            <RotateCcw size={16} /> Réessayer
          </button>
          <Link href="/dashboard" className="btn btn-outline">
            Tableau de bord
          </Link>
        </div>
      </div>
    </main>
  );
}
