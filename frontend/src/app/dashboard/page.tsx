"use client";

import { useEffect, useState } from "react";
import Shell from "../../components/Shell";
import { api, ApiError } from "../../lib/api";

interface Overview {
  studentsCount: number;
  teachersCount: number;
  classesCount: number;
  pendingAdmissions: number;
  attendance: { present: number; absent: number; late: number; justified?: number; total: number; rate: number };
  finance: {
    totalInvoiced: number;
    totalCollected: number;
    outstanding: number;
    recoveryRate: number;
    collectedToday: number;
  };
}

function formatFCFA(amount: number) {
  return new Intl.NumberFormat("fr-FR").format(Math.round(amount)) + " FCFA";
}

export default function DashboardPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Overview>("/dashboard/overview")
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Erreur de chargement"));
  }, []);

  return (
    <Shell title="Tableau de bord">
      <div className="page-header">
        <div>
          <h1>Vue d&apos;ensemble</h1>
          <p>Indicateurs clés de l&apos;établissement, en temps réel</p>
        </div>
      </div>

      {error && <p className="text-danger">{error}</p>}

      {data && (
        <>
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-label">Effectif</div>
              <div className="kpi-value">{data.studentsCount}</div>
              <div className="kpi-sub">élèves inscrits</div>
            </div>
            <div className="kpi-card accent-orange">
              <div className="kpi-label">Enseignants</div>
              <div className="kpi-value">{data.teachersCount}</div>
              <div className="kpi-sub">{data.classesCount} classes actives</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Présence aujourd&apos;hui</div>
              <div className="kpi-value">{data.attendance.rate}%</div>
              <div className="kpi-sub">
                {data.attendance.present} présents · {data.attendance.absent} absents · {data.attendance.late} retards
              </div>
            </div>
            <div className="kpi-card accent-orange">
              <div className="kpi-label">Admissions en cours</div>
              <div className="kpi-value">{data.pendingAdmissions}</div>
              <div className="kpi-sub">candidatures en traitement</div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 15, marginBottom: 16 }}>💰 Finances</h2>
            <div className="kpi-grid" style={{ marginBottom: 0 }}>
              <div>
                <div className="kpi-label">Total facturé</div>
                <div className="kpi-value" style={{ fontSize: 19 }}>
                  {formatFCFA(data.finance.totalInvoiced)}
                </div>
              </div>
              <div>
                <div className="kpi-label">Total encaissé</div>
                <div className="kpi-value text-green" style={{ fontSize: 19 }}>
                  {formatFCFA(data.finance.totalCollected)}
                </div>
              </div>
              <div>
                <div className="kpi-label">Impayés</div>
                <div className="kpi-value text-danger" style={{ fontSize: 19 }}>
                  {formatFCFA(data.finance.outstanding)}
                </div>
              </div>
              <div>
                <div className="kpi-label">Taux de recouvrement</div>
                <div className="kpi-value text-orange" style={{ fontSize: 19 }}>
                  {data.finance.recoveryRate}%
                </div>
              </div>
            </div>
            <div
              style={{
                marginTop: 16,
                height: 10,
                borderRadius: 999,
                background: "var(--border)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.min(data.finance.recoveryRate, 100)}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, var(--ci-orange), var(--ci-green))",
                }}
              />
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              Encaissé aujourd&apos;hui : {formatFCFA(data.finance.collectedToday)}
            </p>
          </div>
        </>
      )}
    </Shell>
  );
}
