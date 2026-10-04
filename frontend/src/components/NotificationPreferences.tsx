"use client";

import { useEffect, useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { useFeedback } from "./ui";
import { api, authorizedFetch, errorMessage } from "../lib/api";

const LABELS: Record<string, { label: string; hint: string }> = {
  GATE: { label: "Arrivées et sorties", hint: "Quand votre enfant entre dans l'établissement ou le quitte." },
  GRADES: { label: "Nouvelles notes", hint: "À chaque note saisie par un enseignant." },
  DOCUMENTS: { label: "Documents disponibles", hint: "Quand l'établissement partage un document avec la famille." },
  ATTENDANCE: { label: "Absences et retards", hint: "Quand votre enfant est noté absent ou en retard à l'appel." },
};

interface Prefs {
  categories: { category: string; enabled: boolean }[];
}

/** What the account wants to be notified of in the application; the other notifications are always sent. */
export default function NotificationPreferences() {
  const feedback = useFeedback();
  const [prefs, setPrefs] = useState<Prefs | null>(null);

  useEffect(() => {
    api.get<Prefs>("/notifications/preferences").then(setPrefs).catch(() => setPrefs(null));
  }, []);

  const toggle = async (category: string, enabled: boolean) => {
    if (!prefs) return;
    const muted = prefs.categories.filter((c) => (c.category === category ? !enabled : !c.enabled)).map((c) => c.category);
    try {
      setPrefs(await api.put<Prefs>("/notifications/preferences", { muted }));
    } catch (err) {
      feedback.error("Préférence non enregistrée", errorMessage(err));
    }
  };

  // Push on this device: needs the installed service worker (production build) and the keys of the server
  const [push, setPush] = useState<{ available: boolean; key: string | null; on: boolean }>({ available: false, key: null, on: false });
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    api
      .get<{ enabled: boolean; publicKey: string | null }>("/notifications/push")
      .then(async (c) => {
        if (!c.enabled) return;
        const registration = await navigator.serviceWorker.getRegistration();
        const current = await registration?.pushManager.getSubscription();
        setPush({ available: !!registration, key: c.publicKey, on: !!current });
      })
      .catch(() => {});
  }, []);

  const togglePush = async () => {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration || !push.key) return;
      const current = await registration.pushManager.getSubscription();
      if (current) {
        await authorizedFetch(api.fileUrl("/notifications/push/devices"), { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: current.endpoint }) });
        await current.unsubscribe();
        setPush({ ...push, on: false });
        return;
      }
      if ((await Notification.requestPermission()) !== "granted") {
        feedback.error("Notifications refusées", "Autorisez les notifications pour ce site dans les réglages du navigateur.");
        return;
      }
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: push.key });
      await api.post("/notifications/push/devices", { endpoint: subscription.endpoint });
      setPush({ ...push, on: true });
      feedback.success("Notifications activées sur cet appareil");
    } catch (err) {
      feedback.error("Activation impossible", errorMessage(err));
    }
  };

  if (!prefs) return null;
  return (
    <section className="card" aria-labelledby="notif-title">
      <h2 id="notif-title" className="card-title">
        <Bell size={18} aria-hidden="true" /> Notifications
      </h2>
      <p className="muted" style={{ marginBottom: 10 }}>
        Choisissez ce qui vous est signalé dans l&apos;application. Les SMS se règlent auprès du secrétariat.
      </p>
      {prefs.categories.map((c) => (
        <label key={c.category} className="checkbox" style={{ display: "flex", alignItems: "flex-start", marginBottom: 8 }}>
          <input type="checkbox" checked={c.enabled} onChange={(e) => toggle(c.category, e.target.checked)} />
          <span>
            {LABELS[c.category]?.label ?? c.category}
            <span className="cell-sub">{LABELS[c.category]?.hint}</span>
          </span>
        </label>
      ))}
      {push.available && (
        <div style={{ marginTop: 10 }}>
          <button type="button" className="btn btn-outline btn-sm" onClick={togglePush} aria-pressed={push.on}>
            <BellRing size={15} /> {push.on ? "Désactiver les notifications sur cet appareil" : "Recevoir les notifications sur cet appareil"}
          </button>
          <p className="field-hint">L&apos;appareil affiche seulement « nouvelle notification » : le détail se lit dans l&apos;application.</p>
        </div>
      )}
    </section>
  );
}
