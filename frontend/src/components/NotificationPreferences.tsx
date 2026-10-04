"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useFeedback } from "./ui";
import { api, errorMessage } from "../lib/api";

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
    </section>
  );
}
