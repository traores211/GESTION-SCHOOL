"use client";

import { useCallback, useEffect, useState } from "react";
import { Bus, ChevronDown, ChevronUp, LoaderCircle, MapPin, Phone, Plus, Radio, Route as RouteIcon, UserMinus, UserPlus } from "lucide-react";
import Shell from "../../components/Shell";
import { CardSkeleton, EmptyState, FormError, Modal, PageHeader, useFeedback } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";

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

const EMPTY_VEHICLE = { plateNumber: "", brand: "", capacity: 30, driverName: "", driverPhone: "" };
const EMPTY_ROUTE = { name: "", vehicleId: "", departureTime: "06:30", monthlyFee: 15000 };

export default function TransportPage() {
  const feedback = useFeedback();
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [routes, setRoutes] = useState<Route[] | null>(null);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [showRouteForm, setShowRouteForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState("");
  const [vehicleForm, setVehicleForm] = useState(EMPTY_VEHICLE);
  const [routeForm, setRouteForm] = useState(EMPTY_ROUTE);

  const loadVehicles = useCallback(() => api.get<Vehicle[]>("/transport/vehicles").then(setVehicles).catch((err) => setError(errorMessage(err))), []);
  const loadRoutes = useCallback(() => api.get<Route[]>("/transport/routes").then(setRoutes).catch((err) => setError(errorMessage(err))), []);

  useEffect(() => {
    loadVehicles();
    loadRoutes();
    api.get<StudentOption[]>("/students").then(setStudents).catch(() => {});
  }, [loadVehicles, loadRoutes]);

  const submit = async (e: React.FormEvent, kind: "vehicle" | "route") => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      if (kind === "vehicle") {
        await api.post("/transport/vehicles", { ...vehicleForm, plateNumber: vehicleForm.plateNumber.trim().toUpperCase() });
        setShowVehicleForm(false);
        feedback.success("Véhicule ajouté", vehicleForm.plateNumber.toUpperCase());
        setVehicleForm(EMPTY_VEHICLE);
        loadVehicles();
      } else {
        await api.post("/transport/routes", { ...routeForm, vehicleId: routeForm.vehicleId || undefined });
        setShowRouteForm(false);
        feedback.success("Circuit créé", routeForm.name);
        setRouteForm(EMPTY_ROUTE);
        loadRoutes();
      }
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const run = async (key: string, action: () => Promise<unknown>, success: string) => {
    setBusy(key);
    try {
      await action();
      feedback.success(success);
      await Promise.all([loadVehicles(), loadRoutes()]);
    } catch (err) {
      feedback.error("Action impossible", errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const subscribe = (routeId: string) =>
    selectedStudent &&
    run("subscribe", () => api.post(`/transport/routes/${routeId}/subscribe/${selectedStudent}`), "Élève abonné au circuit").then(() => setSelectedStudent(""));

  const unsubscribe = async (route: Route, student: StudentOption) => {
    const ok = await feedback.confirm({
      title: `Désabonner ${student.firstName} ${student.lastName} ?`,
      message: `L'élève ne sera plus inscrit au circuit « ${route.name} ».`,
      confirmLabel: "Désabonner",
    });
    if (ok) run(student.id, () => api.post(`/transport/routes/${route.id}/unsubscribe/${student.id}`), "Élève désabonné");
  };

  return (
    <Shell title="Transport scolaire">
      <PageHeader
        title="Transport scolaire"
        description="Véhicules, circuits de ramassage et abonnements des élèves."
        actions={
          <>
            <button className="btn btn-outline" onClick={() => { setFormError(null); setShowVehicleForm(true); }}>
              <Bus size={16} /> Véhicule
            </button>
            <button className="btn btn-primary" onClick={() => { setFormError(null); setShowRouteForm(true); }}>
              <Plus size={16} /> Circuit
            </button>
          </>
        }
      />

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      <h2 className="section-title" style={{ marginBottom: 12 }}>
        Véhicules
      </h2>
      {!vehicles ? (
        <div className="kpi-grid">
          {[0, 1, 2].map((i) => (
            <CardSkeleton key={i} height={70} />
          ))}
        </div>
      ) : vehicles.length === 0 ? (
        <div className="card" style={{ marginBottom: 24 }}>
          <EmptyState icon={<Bus size={22} />} title="Aucun véhicule" action={<button className="btn btn-outline" onClick={() => setShowVehicleForm(true)}><Plus size={16} /> Ajouter un véhicule</button>} />
        </div>
      ) : (
        <div className="kpi-grid stagger">
          {vehicles.map((v, i) => (
            <div className="card" key={v.id} style={{ ["--i" as string]: i }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 800, letterSpacing: "0.04em" }}>{v.plateNumber}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {v.brand || "Véhicule"} · {v.capacity} places
                  </div>
                </div>
                <span className="badge badge-green">Actif</span>
              </div>
              <p className="muted" style={{ fontSize: 12.5, marginTop: 10, display: "flex", gap: 6, alignItems: "center" }}>
                <Phone size={13} /> {v.driverName || "Chauffeur non assigné"} {v.driverPhone ? `· ${v.driverPhone}` : ""}
              </p>
              <p style={{ fontSize: 12.5, marginTop: 6, display: "flex", gap: 6, alignItems: "center" }}>
                <MapPin size={13} />
                {v.lastPingAt ? (
                  <>
                    {v.lastLat?.toFixed(4)}, {v.lastLng?.toFixed(4)} <span className="muted">({new Date(v.lastPingAt).toLocaleTimeString("fr-FR")})</span>
                  </>
                ) : (
                  <span className="muted">Aucune position GPS reçue</span>
                )}
              </p>
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => run(v.id, () => api.post(`/transport/vehicles/${v.id}/ping`), "Position GPS mise à jour")} disabled={busy === v.id}>
                {busy === v.id ? <LoaderCircle size={14} className="spin" /> : <Radio size={14} />} Simuler une position GPS
              </button>
            </div>
          ))}
        </div>
      )}

      <h2 className="section-title" style={{ margin: "8px 0 12px" }}>
        Circuits
      </h2>
      {!routes ? (
        <CardSkeleton height={50} />
      ) : routes.length === 0 ? (
        <div className="card">
          <EmptyState icon={<RouteIcon size={22} />} title="Aucun circuit" action={<button className="btn btn-primary" onClick={() => setShowRouteForm(true)}><Plus size={16} /> Créer un circuit</button>} />
        </div>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          {routes.map((r) => {
            const open = selectedRoute === r.id;
            const subscribed = new Set(r.subscriptions.map((s) => s.student.id));
            const capacity = r.vehicle?.capacity;
            return (
              <div className="card" key={r.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <strong style={{ fontSize: 15 }}>{r.name}</strong>
                    <div className="muted" style={{ fontSize: 12.5 }}>
                      {r.departureTime && `Départ ${r.departureTime} · `}
                      {formatFCFA(r.monthlyFee)}/mois · {r.vehicle?.plateNumber || "Sans véhicule"} · {r.subscriptions.length}
                      {capacity ? `/${capacity}` : ""} abonné(s)
                    </div>
                  </div>
                  <button className="btn btn-outline btn-sm" aria-expanded={open} onClick={() => setSelectedRoute(open ? null : r.id)}>
                    {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />} {open ? "Fermer" : "Gérer les abonnés"}
                  </button>
                </div>

                {open && (
                  <div className="page-enter" style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                    {r.subscriptions.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Aucun élève abonné.</p>}
                    {r.subscriptions.map((s) => (
                      <div key={s.student.id} className="list-row">
                        <span>
                          {s.student.lastName} {s.student.firstName} <span className="muted">({s.student.matricule})</span>
                        </span>
                        <button className="btn btn-danger-ghost btn-sm" onClick={() => unsubscribe(r, s.student)} disabled={busy === s.student.id}>
                          <UserMinus size={14} /> Désabonner
                        </button>
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                      <select className="input" style={{ flex: "1 1 220px" }} aria-label="Élève à abonner" value={selectedStudent} onChange={(e) => setSelectedStudent(e.target.value)}>
                        <option value="">— Sélectionner un élève —</option>
                        {students
                          .filter((s) => !subscribed.has(s.id))
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.lastName} {s.firstName} ({s.matricule})
                            </option>
                          ))}
                      </select>
                      <button className="btn btn-secondary" onClick={() => subscribe(r.id)} disabled={!selectedStudent || busy === "subscribe"}>
                        <UserPlus size={15} /> Abonner
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={showVehicleForm}
        onClose={() => setShowVehicleForm(false)}
        busy={saving}
        title="Nouveau véhicule"
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setShowVehicleForm(false)} disabled={saving}>
              Annuler
            </button>
            <button type="submit" form="vehicle-form" className="btn btn-primary" disabled={saving}>
              {saving ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />} Ajouter
            </button>
          </>
        }
      >
        <form id="vehicle-form" onSubmit={(e) => submit(e, "vehicle")}>
          <FormError message={formError} />
          <div className="form-grid">
            <div className="field">
              <label htmlFor="v-plate" className="required">
                Immatriculation
              </label>
              <input id="v-plate" className="input" required placeholder="1234 AB 01" value={vehicleForm.plateNumber} onChange={(e) => setVehicleForm({ ...vehicleForm, plateNumber: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="v-brand">Marque / modèle</label>
              <input id="v-brand" className="input" value={vehicleForm.brand} onChange={(e) => setVehicleForm({ ...vehicleForm, brand: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="v-capacity">Capacité</label>
              <input id="v-capacity" type="number" min={1} className="input" value={vehicleForm.capacity} onChange={(e) => setVehicleForm({ ...vehicleForm, capacity: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label htmlFor="v-driver">Chauffeur</label>
              <input id="v-driver" className="input" value={vehicleForm.driverName} onChange={(e) => setVehicleForm({ ...vehicleForm, driverName: e.target.value })} />
            </div>
            <div className="field full">
              <label htmlFor="v-phone">Téléphone du chauffeur</label>
              <input id="v-phone" type="tel" className="input" value={vehicleForm.driverPhone} onChange={(e) => setVehicleForm({ ...vehicleForm, driverPhone: e.target.value })} />
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={showRouteForm}
        onClose={() => setShowRouteForm(false)}
        busy={saving}
        title="Nouveau circuit"
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setShowRouteForm(false)} disabled={saving}>
              Annuler
            </button>
            <button type="submit" form="route-form" className="btn btn-primary" disabled={saving}>
              {saving ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />} Créer
            </button>
          </>
        }
      >
        <form id="route-form" onSubmit={(e) => submit(e, "route")}>
          <FormError message={formError} />
          <div className="form-grid">
            <div className="field full">
              <label htmlFor="r-name" className="required">
                Nom du circuit
              </label>
              <input id="r-name" className="input" required placeholder="Ex. Circuit Cocody" value={routeForm.name} onChange={(e) => setRouteForm({ ...routeForm, name: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="r-vehicle">Véhicule</label>
              <select id="r-vehicle" className="input" value={routeForm.vehicleId} onChange={(e) => setRouteForm({ ...routeForm, vehicleId: e.target.value })}>
                <option value="">— Aucun —</option>
                {vehicles?.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.plateNumber}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="r-time">Heure de départ</label>
              <input id="r-time" type="time" className="input" value={routeForm.departureTime} onChange={(e) => setRouteForm({ ...routeForm, departureTime: e.target.value })} />
            </div>
            <div className="field full">
              <label htmlFor="r-fee">Tarif mensuel (FCFA)</label>
              <input id="r-fee" type="number" min={0} step={500} className="input" value={routeForm.monthlyFee} onChange={(e) => setRouteForm({ ...routeForm, monthlyFee: Number(e.target.value) })} />
            </div>
          </div>
        </form>
      </Modal>
    </Shell>
  );
}
