import Link from "next/link";
import { BrandMark, FlagBand } from "../components/Brand";

export const metadata = { title: "Page introuvable" };

/** 404 in the app's style. */
export default function NotFound() {
  return (
    <main className="status-page">
      <FlagBand />
      <div className="status-card">
        <BrandMark size={34} />
        <p className="status-code">404</p>
        <h1>Cette page n&apos;existe pas</h1>
        <p>Le lien est peut-être incomplet, ou la page a été déplacée.</p>
        <div className="btn-row" style={{ justifyContent: "center" }}>
          <Link href="/dashboard" className="btn btn-primary">
            Tableau de bord
          </Link>
          <Link href="/" className="btn btn-outline">
            Accueil
          </Link>
        </div>
      </div>
    </main>
  );
}
