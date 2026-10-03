"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import { flushQueue, readQueue } from "../lib/offline";
import { useFeedback } from "./ui";

/** Event other screens send after putting a roll call in the offline queue. */
export const OFFLINE_QUEUE_EVENT = "schoolerp:offline-queue";

/**
 * Sends the roll calls taken without network as soon as the connection is back, and shows what is
 * still waiting on this device. Mounted once in the application shell.
 */
export default function OfflineSync() {
  const feedback = useFeedback();
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(true);
  const flushing = useRef(false);

  const flush = useCallback(async () => {
    if (flushing.current || readQueue().length === 0) {
      setPending(readQueue().length);
      return;
    }
    flushing.current = true;
    try {
      const result = await flushQueue((entry) => api.post("/attendance/mark", { classId: entry.classId, date: entry.date, records: entry.records }));
      if (result.sent.length) feedback.success(`${result.sent.length} appel(s) envoyé(s)`, result.sent.map((e) => e.className).join(", "));
      for (const r of result.rejected) feedback.error(`Appel de ${r.entry.className} refusé`, r.reason);
      setPending(result.remaining);
    } finally {
      flushing.current = false;
    }
  }, [feedback]);

  useEffect(() => {
    setOnline(navigator.onLine);
    setPending(readQueue().length);
    void flush();
    const goOnline = () => {
      setOnline(true);
      void flush();
    };
    const goOffline = () => setOnline(false);
    const queued = () => setPending(readQueue().length);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    window.addEventListener(OFFLINE_QUEUE_EVENT, queued);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener(OFFLINE_QUEUE_EVENT, queued);
    };
  }, [flush]);

  if (online && pending === 0) return null;
  return (
    <div className="alert alert-warning" role="status" style={{ marginBottom: 16 }}>
      <CloudOff size={17} />
      <div className="alert-body">
        {!online && <span className="alert-title">Vous êtes hors connexion.</span>}{" "}
        {pending > 0 ? `${pending} appel(s) conservé(s) sur cet appareil, envoyé(s) dès le retour du réseau.` : "L'appel reste possible : il sera envoyé au retour du réseau."}
      </div>
      {online && pending > 0 && (
        <button type="button" className="btn btn-outline btn-sm" onClick={() => void flush()}>
          <RefreshCw size={14} /> Envoyer maintenant
        </button>
      )}
    </div>
  );
}
