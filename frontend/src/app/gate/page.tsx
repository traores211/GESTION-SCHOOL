"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, DoorOpen, LogIn, LogOut, QrCode, ScanLine } from "lucide-react";
import Shell from "../../components/Shell";
import { EmptyState, FormError, Modal, PageHeader, TableSkeleton, useFeedback } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { getStoredUser } from "../../lib/auth";

interface GateEvent {
  id: string;
  kind: "ENTREE" | "SORTIE";
  occurredAt: string;
  accessPoint: string | null;
  method: string;
  late: boolean;
  early: boolean;
  reason: string | null;
  pickedUpBy: string | null;
  recordedByName: string | null;
  student: { id: string; firstName: string; lastName: string; matricule: string };
  duplicate?: boolean;
  class?: string | null;
}
interface Today {
  entries: number;
  exits: number;
  late: number;
  earlyExits: number;
  inside: number;
}
interface StudentOption {
  id: string;
  firstName: string;
  lastName: string;
  matricule: string;
}
interface Guardian {
  id: string;
  name: string;
  relation: string;
  canPickUp: boolean;
}
interface Card {
  name: string;
  matricule: string;
  qr: string;
}

const OFFICE = ["SUPER_ADMIN", "ADMIN_ORGANISATION", "DIRECTOR", "SECRETARY"];
const RELATIONS: Record<string, string> = { PERE: "père", MERE: "mère", TUTEUR: "tuteur", AUTRE: "responsable" };
const time = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

// BarcodeDetector is not in the TypeScript DOM library yet
type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
const detectorClass = () => (typeof window === "undefined" ? undefined : (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector);

function GateContent() {
  const feedback = useFeedback();
  const isOffice = OFFICE.includes(getStoredUser()?.role ?? "");
  const [today, setToday] = useState<Today | null>(null);
  const [events, setEvents] = useState<GateEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accessPoint, setAccessPoint] = useState("Portail principal");
  const [token, setToken] = useState("");
  const [last, setLast] = useState<GateEvent | null>(null);
  const [search, setSearch] = useState("");
  const [matches, setMatches] = useState<StudentOption[]>([]);
  const [exit, setExit] = useState<StudentOption | null>(null);
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [exitForm, setExitForm] = useState({ reason: "", pickedUpParentId: "", pickedUpBy: "" });
  const [exitError, setExitError] = useState<string | null>(null);
  const [card, setCard] = useState<(Card & { studentId: string }) | null>(null);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api.get<Today>("/gate/today").then(setToday).catch(() => {});
    api
      .get<{ items: GateEvent[] }>("/gate/events?page=1")
      .then((r) => {
        setEvents(r.items);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);
  useEffect(load, [load]);

  const done = (e: GateEvent) => {
    setLast(e);
    if (!e.duplicate) load();
  };

  const scan = useCallback(
    async (value: string) => {
      const code = value.trim();
      if (!code) return;
      setToken("");
      try {
        done(await api.post<GateEvent>("/gate/scan", { token: code, accessPoint }));
      } catch (err) {
        setLast(null);
        feedback.error("Carte refusée", errorMessage(err));
      }
      scanRef.current?.focus();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accessPoint],
  );

  // Camera reading of the card, where the browser can read QR codes by itself
  useEffect(() => {
    if (!scanning) return;
    const Detect = detectorClass();
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stopped || !videoRef.current || !Detect) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const detector = new Detect({ formats: ["qr_code"] });
        let lastCode = "";
        timer = setInterval(async () => {
          if (!videoRef.current) return;
          const found = await detector.detect(videoRef.current).catch(() => []);
          const code = found[0]?.rawValue;
          if (code && code !== lastCode) {
            lastCode = code;
            setTimeout(() => (lastCode = ""), 4000);
            scan(code);
          }
        }, 400);
      } catch {
        feedback.error("Caméra indisponible", "Autorisez l'accès à la caméra, ou saisissez le code avec un lecteur.");
        setScanning(false);
      }
    })();
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning, scan]);

  useEffect(() => {
    if (search.trim().length < 2) return setMatches([]);
    const timer = setTimeout(() => {
      api
        .get<StudentOption[]>(`/students?search=${encodeURIComponent(search.trim())}`)
        .then((list) => setMatches(list.slice(0, 8)))
        .catch(() => setMatches([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const enter = async (s: StudentOption) => {
    try {
      done(await api.post<GateEvent>("/gate/events", { studentId: s.id, kind: "ENTREE", accessPoint }));
    } catch (err) {
      feedback.error("Enregistrement impossible", errorMessage(err));
    }
  };

  const openExit = (s: StudentOption) => {
    setExit(s);
    setExitForm({ reason: "", pickedUpParentId: "", pickedUpBy: "" });
    setExitError(null);
    setGuardians([]);
    api.get<Guardian[]>(`/gate/students/${s.id}/pick-up`).then(setGuardians).catch(() => {});
  };

  const confirmExit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exit) return;
    setExitError(null);
    try {
      const body = { studentId: exit.id, kind: "SORTIE", accessPoint, ...(exitForm.reason ? { reason: exitForm.reason } : {}), ...(exitForm.pickedUpParentId ? { pickedUpParentId: exitForm.pickedUpParentId } : exitForm.pickedUpBy ? { pickedUpBy: exitForm.pickedUpBy } : {}) };
      done(await api.post<GateEvent>("/gate/events", body));
      setExit(null);
    } catch (err) {
      setExitError(errorMessage(err));
    }
  };

  const showCard = async (s: StudentOption, renew = false) => {
    try {
      const c = renew ? await api.post<Card>(`/gate/students/${s.id}/card/renew`) : await api.get<Card>(`/gate/students/${s.id}/card`);
      setCard({ ...c, studentId: s.id });
    } catch (err) {
      feedback.error("Carte indisponible", errorMessage(err));
    }
  };

  const renew = async () => {
    if (!card) return;
    const yes = await feedback.confirm({ title: "Renouveler cette carte ?", message: "L'ancienne carte ne fonctionnera plus au portail. À faire quand une carte est perdue.", confirmLabel: "Renouveler", tone: "warning" });
    if (yes) await showCard({ id: card.studentId, firstName: "", lastName: card.name, matricule: card.matricule }, true);
  };

  return (
    <>
      <PageHeader title="Entrées et sorties" description="Chaque passage au portail est enregistré avec l'heure, le point d'accès et la personne qui l'a saisi. La famille est prévenue aussitôt." />

      <div className="stat-row" style={{ marginBottom: 18 }}>
        {[
          ["Arrivées", today?.entries],
          ["Sorties", today?.exits],
          ["Présents dans l'établissement", today?.inside],
          ["Retards", today?.late],
          ["Sorties anticipées", today?.earlyExits],
        ].map(([label, value]) => (
          <div className="card" key={label as string} style={{ padding: "12px 16px" }}>
            <div className="cell-sub">{label}</div>
            <div className="tabular" style={{ fontSize: 24, fontWeight: 600 }}>
              {value ?? "—"}
            </div>
          </div>
        ))}
      </div>

      <div className="form-grid" style={{ alignItems: "end", marginBottom: 6 }}>
        <div className="field">
          <label htmlFor="gt-point">Point d&apos;accès</label>
          <input id="gt-point" className="input" maxLength={80} value={accessPoint} onChange={(e) => setAccessPoint(e.target.value)} />
        </div>
        <form className="field" onSubmit={(e) => { e.preventDefault(); scan(token); }}>
          <label htmlFor="gt-scan">
            <ScanLine size={14} style={{ verticalAlign: "-2px" }} /> Carte de l&apos;élève (lecteur de QR code)
          </label>
          <input id="gt-scan" ref={scanRef} className="input" autoComplete="off" autoFocus placeholder="Présentez la carte devant le lecteur" value={token} onChange={(e) => setToken(e.target.value)} />
        </form>
        <div className="field">
          <label htmlFor="gt-search">Sans carte : rechercher l&apos;élève</label>
          <input id="gt-search" className="input" type="search" placeholder="Nom, prénom ou matricule…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      {detectorClass() && (
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setScanning((s) => !s)} aria-pressed={scanning} style={{ marginBottom: 10 }}>
          <Camera size={15} /> {scanning ? "Arrêter la caméra" : "Lire les cartes avec la caméra"}
        </button>
      )}
      {scanning && <video ref={videoRef} muted playsInline style={{ display: "block", width: "100%", maxWidth: 360, borderRadius: 8, marginBottom: 10 }} aria-label="Aperçu de la caméra" />}

      {matches.length > 0 && (
        <div className="table-wrap" style={{ marginBottom: 14 }}>
          <table>
            <tbody>
              {matches.map((s) => (
                <tr key={s.id}>
                  <td>
                    <span className="cell-main">
                      {s.lastName} {s.firstName}
                    </span>{" "}
                    <span className="cell-sub">{s.matricule}</span>
                  </td>
                  <td className="actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => enter(s)} aria-label={`Enregistrer l'arrivée de ${s.firstName} ${s.lastName}`}>
                      <LogIn size={15} /> Arrivée
                    </button>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => openExit(s)} aria-label={`Enregistrer la sortie de ${s.firstName} ${s.lastName}`}>
                      <LogOut size={15} /> Sortie
                    </button>
                    {isOffice && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => showCard(s)} aria-label={`Carte QR de ${s.firstName} ${s.lastName}`}>
                        <QrCode size={15} /> Carte
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div aria-live="polite">
        {last && (
          <div className={`alert ${last.duplicate ? "alert-warning" : "alert-success"}`} role="status" style={{ marginBottom: 14 }}>
            <div className="alert-body">
              <span className="alert-title">
                {last.student.lastName} {last.student.firstName}
                {last.class ? ` (${last.class})` : ""} : {last.kind === "ENTREE" ? "arrivée" : "sortie"} à {time(last.occurredAt)}
              </span>{" "}
              {last.duplicate ? "Passage déjà enregistré il y a un instant." : last.late ? "Arrivée en retard." : "La famille est prévenue."}
            </div>
          </div>
        )}
      </div>

      <h2 className="section-title">Passages du jour</h2>
      <div className="table-wrap">
        {error ? (
          <EmptyState tone="error" title="Passages indisponibles">
            {error}
          </EmptyState>
        ) : !events ? (
          <TableSkeleton columns={4} rows={5} />
        ) : events.length === 0 ? (
          <EmptyState icon={<DoorOpen size={22} />} title="Aucun passage enregistré aujourd'hui" />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Heure</th>
                <th>Élève</th>
                <th>Passage</th>
                <th>Enregistré par</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="tabular">{time(e.occurredAt)}</td>
                  <td>
                    <div className="cell-main">
                      {e.student.lastName} {e.student.firstName}
                    </div>
                    <div className="cell-sub">{e.student.matricule}</div>
                  </td>
                  <td>
                    <span className={`badge ${e.kind === "ENTREE" ? "badge-green" : "badge-info"}`}>{e.kind === "ENTREE" ? "Arrivée" : "Sortie"}</span> {e.late && <span className="badge badge-warning">Retard</span>}{" "}
                    {e.early && <span className="badge badge-warning">Sortie anticipée</span>}
                    {(e.reason || e.pickedUpBy) && <div className="cell-sub">{[e.reason, e.pickedUpBy ? `avec ${e.pickedUpBy}` : null].filter(Boolean).join(" · ")}</div>}
                  </td>
                  <td>
                    {e.recordedByName ?? "—"}
                    <div className="cell-sub">{[e.accessPoint, e.method === "QR" ? "carte QR" : "saisie manuelle"].filter(Boolean).join(" · ")}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={!!exit}
        onClose={() => setExit(null)}
        title={exit ? `Sortie de ${exit.firstName} ${exit.lastName}` : ""}
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setExit(null)}>
              Annuler
            </button>
            <button type="submit" form="exit-form" className="btn btn-primary">
              <LogOut size={16} /> Enregistrer la sortie
            </button>
          </>
        }
      >
        <form id="exit-form" onSubmit={confirmExit}>
          <FormError message={exitError} />
          <div className="field">
            <label htmlFor="ex-reason">Motif (obligatoire avant la fin des cours)</label>
            <input id="ex-reason" className="input" maxLength={300} placeholder="Rendez-vous médical, malaise…" value={exitForm.reason} onChange={(e) => setExitForm({ ...exitForm, reason: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="ex-who">Personne qui récupère l&apos;élève</label>
            <select id="ex-who" className="input" value={exitForm.pickedUpParentId} onChange={(e) => setExitForm({ ...exitForm, pickedUpParentId: e.target.value, pickedUpBy: "" })}>
              <option value="">L&apos;élève sort seul / autre personne</option>
              {guardians.map((g) => (
                <option key={g.id} value={g.id} disabled={!g.canPickUp}>
                  {g.name} ({RELATIONS[g.relation] ?? "responsable"}){g.canPickUp ? "" : " : non autorisé(e)"}
                </option>
              ))}
            </select>
          </div>
          {isOffice && !exitForm.pickedUpParentId && (
            <div className="field">
              <label htmlFor="ex-other">Autre adulte (nom complet)</label>
              <input id="ex-other" className="input" maxLength={120} value={exitForm.pickedUpBy} onChange={(e) => setExitForm({ ...exitForm, pickedUpBy: e.target.value })} />
              <span className="field-hint">Réservé au secrétariat et à la direction, avec un motif.</span>
            </div>
          )}
        </form>
      </Modal>

      <Modal
        open={!!card}
        onClose={() => setCard(null)}
        title="Carte d'accès"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={renew}>
              Carte perdue : renouveler
            </button>
            <button type="button" className="btn btn-primary" onClick={() => window.print()}>
              Imprimer
            </button>
          </>
        }
      >
        {card && (
          <div style={{ textAlign: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={card.qr} alt={`QR code de la carte de ${card.name}`} width={220} height={220} />
            <div className="cell-main" style={{ marginTop: 8 }}>
              {card.name}
            </div>
            <div className="cell-sub">{card.matricule}</div>
          </div>
        )}
      </Modal>
    </>
  );
}

export default function GatePage() {
  return (
    <Shell title="Entrées et sorties">
      <GateContent />
    </Shell>
  );
}
