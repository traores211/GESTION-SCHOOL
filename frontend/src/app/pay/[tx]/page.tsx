"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { CircleCheck, CircleX, LoaderCircle, Smartphone } from "lucide-react";
import AuthCard from "../../../components/AuthCard";
import { api, errorMessage } from "../../../lib/api";

interface PaymentStatus {
  transactionId: string;
  status: "PENDING" | "SUCCESS" | "FAILED" | "CANCELLED" | "REFUNDED";
  amount: number;
  invoiceReference: string;
  label: string;
  schoolName: string;
  studentName: string;
  paidAt: string | null;
  simulated: boolean;
  checkoutUrl: string | null;
}

const WALLETS = [
  { value: "MOBILE_MONEY_ORANGE", label: "Orange Money" },
  { value: "MOBILE_MONEY_MTN", label: "MTN MoMo" },
  { value: "MOBILE_MONEY_MOOV", label: "Moov Money" },
  { value: "WAVE", label: "Wave" },
];

function formatFCFA(amount: number) {
  return new Intl.NumberFormat("fr-FR").format(Math.round(amount)) + " FCFA";
}

/** Public payment page reached from a payment link: no account needed. */
export default function PayPage() {
  const { tx } = useParams<{ tx: string }>();
  const [payment, setPayment] = useState<PaymentStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wallet, setWallet] = useState(WALLETS[0].value);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(
    (confirm: boolean) =>
      (confirm ? api.post<PaymentStatus>(`/payments/${tx}/refresh`) : api.get<PaymentStatus>(`/payments/${tx}`))
        .then((p) => {
          setPayment(p);
          setError(null);
        })
        .catch((err) => setError(errorMessage(err, "Paiement introuvable"))),
    [tx],
  );

  useEffect(() => {
    refresh(true);
  }, [refresh]);

  // While the payer validates on their phone, ask the gateway every few seconds (real gateway only).
  useEffect(() => {
    if (payment?.status === "PENDING" && !payment.simulated) {
      timer.current = setInterval(() => refresh(true), 6000);
      return () => {
        if (timer.current) clearInterval(timer.current);
      };
    }
  }, [payment?.status, payment?.simulated, refresh]);

  const simulate = async (outcome: "SUCCESS" | "FAILED") => {
    setBusy(true);
    try {
      setPayment(await api.post<PaymentStatus>(`/payments/${tx}/simulate`, { outcome, method: wallet }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (error && !payment) {
    return (
      <AuthCard title="Paiement introuvable" subtitle="Ce lien de paiement n'existe pas ou n'est plus valable.">
        <div className="alert alert-danger" role="alert">
          <CircleX size={16} />
          <div className="alert-body">{error}</div>
        </div>
      </AuthCard>
    );
  }

  if (!payment) {
    return (
      <AuthCard title="Paiement" subtitle="Chargement…">
        <div className="skeleton" style={{ height: 120 }} />
      </AuthCard>
    );
  }

  return (
    <AuthCard title={formatFCFA(payment.amount)} subtitle={payment.schoolName}>
      <dl className="pay-summary">
        <div>
          <dt>Facture</dt>
          <dd>{payment.invoiceReference}</dd>
        </div>
        <div>
          <dt>Objet</dt>
          <dd>{payment.label}</dd>
        </div>
        <div>
          <dt>Élève</dt>
          <dd>{payment.studentName}</dd>
        </div>
      </dl>

      {payment.status === "SUCCESS" && (
        <div className="alert alert-success" role="status">
          <CircleCheck size={16} />
          <div className="alert-body">
            <strong>Paiement reçu.</strong> Merci ! L&apos;établissement a été prévenu{payment.paidAt ? ` le ${new Date(payment.paidAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}` : ""}. Conservez la référence {payment.transactionId}.
          </div>
        </div>
      )}

      {(payment.status === "FAILED" || payment.status === "CANCELLED") && (
        <div className="alert alert-danger" role="alert">
          <CircleX size={16} />
          <div className="alert-body">
            <strong>Le paiement n&apos;a pas abouti.</strong> Aucun montant n&apos;a été enregistré. Demandez un nouveau lien à l&apos;établissement ou réessayez depuis votre espace parent.
          </div>
        </div>
      )}

      {payment.status === "REFUNDED" && (
        <div className="alert alert-warning" role="status">
          <div className="alert-body">Ce paiement a été remboursé par l&apos;établissement.</div>
        </div>
      )}

      {payment.status === "PENDING" && !payment.simulated && (
        <>
          {payment.checkoutUrl && (
            <a className="btn btn-primary btn-block btn-lg" href={payment.checkoutUrl}>
              <Smartphone size={18} /> Payer par Mobile Money ou carte
            </a>
          )}
          <p className="muted pay-wait" role="status">
            <LoaderCircle size={14} className="spin" /> En attente de la confirmation du paiement…
          </p>
        </>
      )}

      {payment.status === "PENDING" && payment.simulated && (
        <>
          <div className="alert alert-warning" role="note">
            <div className="alert-body">
              <strong>Mode démonstration.</strong> Aucun argent n&apos;est débité : choisissez l&apos;issue du paiement.
            </div>
          </div>
          <div className="field">
            <label htmlFor="pay-wallet">Portefeuille</label>
            <select id="pay-wallet" className="input" value={wallet} onChange={(e) => setWallet(e.target.value)}>
              {WALLETS.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="btn btn-primary btn-block btn-lg" onClick={() => simulate("SUCCESS")} disabled={busy}>
            {busy ? <LoaderCircle size={18} className="spin" /> : <CircleCheck size={18} />} Simuler un paiement réussi
          </button>
          <button type="button" className="btn btn-outline btn-block" style={{ marginTop: 8 }} onClick={() => simulate("FAILED")} disabled={busy}>
            Simuler un échec
          </button>
        </>
      )}
    </AuthCard>
  );
}
