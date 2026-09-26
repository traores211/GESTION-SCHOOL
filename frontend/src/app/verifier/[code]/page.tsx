import type { Metadata } from "next";
import { serverGet } from "../../../lib/server-api";

export const metadata: Metadata = { title: "Vérification de document", robots: { index: false } };

interface Verification {
  authentic: boolean;
  school: string;
  documentType: string;
  number: string;
  issuedAt: string;
}

/** Public page reached by scanning the QR code of a document. Shows no personal data. */
export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const v = await serverGet<Verification>(`/public/documents/verify/${encodeURIComponent(code)}`, 0);
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <div className="card" style={{ maxWidth: 480, width: "100%" }}>
        <h1 style={{ marginBottom: 12 }}>Vérification de document</h1>
        {v ? (
          <>
            <p className="alert alert-success" role="status">
              Document authentique, émis par la plateforme.
            </p>
            <dl className="stack">
              <div>
                <dt className="muted">Établissement</dt>
                <dd>{v.school}</dd>
              </div>
              <div>
                <dt className="muted">Type</dt>
                <dd>{v.documentType}</dd>
              </div>
              <div>
                <dt className="muted">Numéro</dt>
                <dd>{v.number}</dd>
              </div>
              <div>
                <dt className="muted">Date d&apos;émission</dt>
                <dd>{new Date(v.issuedAt).toLocaleDateString("fr-FR")}</dd>
              </div>
            </dl>
            <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
              Comparez ces informations avec le document présenté. Toute différence indique une falsification.
            </p>
          </>
        ) : (
          <p className="alert alert-error" role="alert">
            Aucun document ne correspond à ce code. Ce document n&apos;a pas été émis par la plateforme ou le lien est incomplet.
          </p>
        )}
      </div>
    </main>
  );
}
