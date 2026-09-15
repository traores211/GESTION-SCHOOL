"use client";

import { useEffect, useState } from "react";
import Shell from "../../components/Shell";
import { api, ApiError } from "../../lib/api";

interface Vehicle {
  id: string;
  plateNumber: string;
  brand?: string;
  capacity: number;
  driverName?: string;
  driverPhone?: string;
  lastLat?: number;
  lastLng?: number;
  lastPingAt?: string;
}

interface StudentOption {
  id: string;
  firstName: string;
  lastName: string;
  matricule: string;
}

interface Route {
  id: string;
  name: string;
  departureTime?: string;
  monthlyFee: number;
  vehicle: Vehicle | null;
  subscriptions: { student: StudentOption }[];
}

function formatFCFA(amount: number) {
  return new Intl.NumberFormat("fr-FR").format(Math.round(amount)) + " FCFA";
}

export default function TransportPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [showRouteForm, setShowRouteForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState("");

  const [vehicleForm, setVehicleForm] = useState({ plateNumber: "", brand: "", capacity: 30, driverName: "", driverPhone: "" });
  const [routeForm, setRouteForm] = useState({ name: "", vehicleId: "", departureTime: "06:30", monthlyFee: 15000 });

  const loadVehicles = () => api.get<Vehicle[]>("/transport/vehicles").then(setVehicles).catch((err) => setError(err instanceof ApiError ? err.message : "Erreur"));
  const loadRoutes = () => api.get<Route[]>("/transport/routes").then(setRoutes).catch((err) => setError(err instanceof ApiError ? err.message : "Erreur"));

  useEffect(() => {
    loadVehicles();
    loadRoutes();
    api.get<StudentOption[]>("/students").then(setStudents).catch(() => {});
  }, []);

  const createVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/transport/vehicles", vehicleForm);
      setShowVehicleForm(false);
      setVehicleForm({ plateNumber: "", brand: "", capacity: 30, driverName: "", driverPhone: "" });
      loadVehicles();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  const createRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/transport/routes", { ...routeForm, vehicleId: routeForm.vehicleId || undefined });
      setShowRouteForm(false);
      setRouteForm({ name: "", vehicleId: "", departureTime: "06:30", monthlyFee: 15000 });
      loadRoutes();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  const pingVehicle = async (id: string) => {
    await api.post(`/transport/vehicles/${id}/ping`);
    loadVehicles();
    loadRoutes();
  };

  const subscribe = async () => {
    if (!selectedRoute || !selectedStudent) return;
    await api.post(`/transport/routes/${selectedRoute}/subscribe/${selectedStudent}`);
    setSelectedStudent("");
    loadRoutes();
  };

  const unsubscribe = async (routeId: string, studentId: string) => {
    await api.post(`/transport/routes/${routeId}/unsubscribe/${studentId}`);
    loadRoutes();
  };

  return (
    <Shell title="Transport scolaire">
      <div className="page-header">
        <div>
          <h1>🚌 Transport scolaire</h1>
          <p>Véhicules, circuits et abonnements élèves</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-outline" onClick={() => setShowVehicleForm(true)}>+ Véhicule</button>
          <button className="btn btn-primary" onClick={() => setShowRouteForm(true)}>+ Circuit</button>
        </div>
      </div>

      {error && <p className="text-danger">{error}</p>}

      <div className="kpi-grid">
        {vehicles.map((v) => (
          <div className="card" key={v.id}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 800 }}>{v.plateNumber}</div>
                <div className="muted" style={{ fontSize: 12 }}>{v.brand || "Véhicule"} — {v.capacity} places</div>
              </div>
              <span className="badge badge-green">Actif</span>
            </div>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
              👤 {v.driverName || "Chauffeur non assigné"} {v.driverPhone ? `· ${v.driverPhone}` : ""}
            </p>
            <p style={{ fontSize: 12, marginTop: 6 }}>
              {v.lastPingAt ? (
                <>📍 {v.lastLat?.toFixed(4)}, {v.lastLng?.toFixed(4)} <span className="muted">({new Date(v.lastPingAt).toLocaleTimeString("fr-FR")})</span></>
              ) : (
                <span className="muted">Aucune position GPS reçue</span>
              )}
            </p>
            <button className="btn btn-outline btn-sm" style={{ marginTop: 10 }} onClick={() => pingVehicle(v.id)}>
              📡 Simuler position GPS
            </button>
          </div>
        ))}
        {vehicles.length === 0 && <div className="empty-state">Aucun véhicule enregistré.</div>}
      </div>

      <h2 style={{ fontSize: 16, margin: "24px 0 12px" }}>Circuits</h2>
      {routes.map((r) => (
        <div className="card" key={r.id} style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong>{r.name}</strong>
              <span className="muted" style={{ fontSize: 12.5, marginLeft: 8 }}>
                {r.departureTime && `Départ ${r.departureTime}`} — {formatFCFA(r.monthlyFee)}/mois — {r.vehicle?.plateNumber || "Sans véhicule"}
              </span>
            </div>
            <button className="btn btn-outline btn-sm" onClick={() => setSelectedRoute(selectedRoute === r.id ? null : r.id)}>
              {selectedRoute === r.id ? "Fermer" : "Gérer les abonnés"}
            </button>
          </div>

          {selectedRoute === r.id && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
              {r.subscriptions.map((s) => (
                <div key={s.student.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
                  <span>{s.student.lastName} {s.student.firstName} ({s.student.matricule})</span>
                  <button className="btn btn-outline btn-sm" onClick={() => unsubscribe(r.id, s.student.id)}>Retirer</button>
                </div>
              ))}
              {r.subscriptions.length === 0 && <p className="muted" style={{ fontSize: 12.5 }}>Aucun élève abonné.</p>}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <select className="input" value={selectedStudent} onChange={(e) => setSelectedStudent(e.target.value)}>
                  <option value="">— Sélectionner un élève —</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>{s.lastName} {s.firstName}</option>
                  ))}
                </select>
                <button className="btn btn-secondary btn-sm" onClick={subscribe} disabled={!selectedStudent}>Abonner</button>
              </div>
            </div>
          )}
        </div>
      ))}
      {routes.length === 0 && <div className="empty-state">Aucun circuit créé.</div>}

      {showVehicleForm && (
        <div className="modal-overlay" onClick={() => setShowVehicleForm(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 17, marginBottom: 16 }}>Nouveau véhicule</h2>
            <form onSubmit={createVehicle}>
              <div className="form-grid">
                <div className="field">
                  <label>Immatriculation</label>
                  <input className="input" required value={vehicleForm.plateNumber} onChange={(e) => setVehicleForm({ ...vehicleForm, plateNumber: e.target.value })} />
                </div>
                <div className="field">
                  <label>Marque / Modèle</label>
                  <input className="input" value={vehicleForm.brand} onChange={(e) => setVehicleForm({ ...vehicleForm, brand: e.target.value })} />
                </div>
                <div className="field">
                  <label>Capacité</label>
                  <input type="number" className="input" value={vehicleForm.capacity} onChange={(e) => setVehicleForm({ ...vehicleForm, capacity: Number(e.target.value) })} />
                </div>
                <div className="field">
                  <label>Chauffeur</label>
                  <input className="input" value={vehicleForm.driverName} onChange={(e) => setVehicleForm({ ...vehicleForm, driverName: e.target.value })} />
                </div>
                <div className="field" style={{ gridColumn: "1 / -1" }}>
                  <label>Téléphone chauffeur</label>
                  <input className="input" value={vehicleForm.driverPhone} onChange={(e) => setVehicleForm({ ...vehicleForm, driverPhone: e.target.value })} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowVehicleForm(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Enregistrement…" : "Créer"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showRouteForm && (
        <div className="modal-overlay" onClick={() => setShowRouteForm(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 17, marginBottom: 16 }}>Nouveau circuit</h2>
            <form onSubmit={createRoute}>
              <div className="form-grid">
                <div className="field" style={{ gridColumn: "1 / -1" }}>
                  <label>Nom du circuit</label>
                  <input className="input" required placeholder="Ex: Circuit Cocody" value={routeForm.name} onChange={(e) => setRouteForm({ ...routeForm, name: e.target.value })} />
                </div>
                <div className="field">
                  <label>Véhicule</label>
                  <select className="input" value={routeForm.vehicleId} onChange={(e) => setRouteForm({ ...routeForm, vehicleId: e.target.value })}>
                    <option value="">— Aucun —</option>
                    {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plateNumber}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Heure de départ</label>
                  <input className="input" value={routeForm.departureTime} onChange={(e) => setRouteForm({ ...routeForm, departureTime: e.target.value })} />
                </div>
                <div className="field" style={{ gridColumn: "1 / -1" }}>
                  <label>Tarif mensuel (FCFA)</label>
                  <input type="number" className="input" value={routeForm.monthlyFee} onChange={(e) => setRouteForm({ ...routeForm, monthlyFee: Number(e.target.value) })} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowRouteForm(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Enregistrement…" : "Créer"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Shell>
  );
}
