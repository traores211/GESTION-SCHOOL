"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { api } from "../lib/api";

interface Notification {
  id: string;
  subject: string | null;
  message: string;
  isRead: boolean;
  createdAt: string;
}

const POLL_MS = 60_000;

function timeAgo(date: string) {
  const minutes = Math.round((Date.now() - new Date(date).getTime()) / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return new Date(date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[] | null>(null);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const loadCount = useCallback(() => {
    api.get<number>("/notifications/unread-count").then(setUnread).catch(() => {});
  }, []);

  const loadList = () => {
    api.get<Notification[]>("/notifications").then(setItems).catch(() => setItems([]));
  };

  // Poll only while the tab is visible.
  useEffect(() => {
    loadCount();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") loadCount();
    }, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && loadCount();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadCount]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    if (!open) loadList();
    setOpen((o) => !o);
  };

  const markRead = async (id: string) => {
    setItems((list) => list?.map((n) => (n.id === id ? { ...n, isRead: true } : n)) ?? null);
    setUnread((u) => Math.max(0, u - 1));
    await api.patch(`/notifications/${id}/read`).catch(loadCount);
  };

  const markAllRead = async () => {
    setItems((list) => list?.map((n) => ({ ...n, isRead: true })) ?? null);
    setUnread(0);
    await api.patch("/notifications/mark-all-read").catch(loadCount);
  };

  return (
    <div className="menu-anchor" ref={ref}>
      <button
        className="btn btn-ghost btn-icon"
        onClick={toggle}
        style={{ position: "relative" }}
        aria-label={unread ? `Notifications (${unread} non lues)` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Bell size={19} />
        {unread > 0 && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 3,
              right: 3,
              background: "var(--accent)",
              color: "#fff",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 800,
              minWidth: 17,
              height: 17,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 4px",
              border: "2px solid #fff",
            }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="menu" style={{ width: 360, maxWidth: "calc(100vw - 24px)", padding: 0, maxHeight: 440, overflowY: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, background: "var(--surface)" }}>
            <strong style={{ fontSize: 14 }}>Notifications</strong>
            {unread > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={markAllRead}>
                <CheckCheck size={15} /> Tout marquer lu
              </button>
            )}
          </div>
          {items === null && (
            <div style={{ padding: 14, display: "grid", gap: 10 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton" style={{ height: 36 }} />
              ))}
            </div>
          )}
          {items?.length === 0 && <p className="muted" style={{ padding: "28px 16px", fontSize: 13, textAlign: "center" }}>Vous êtes à jour : aucune notification.</p>}
          {items?.map((n) => (
            <button
              type="button"
              key={n.id}
              className="menu-item"
              onClick={() => !n.isRead && markRead(n.id)}
              style={{ borderRadius: 0, alignItems: "flex-start", borderBottom: "1px solid var(--border)", background: n.isRead ? undefined : "var(--brand-soft)", padding: "10px 14px" }}
            >
              <span style={{ width: 8, height: 8, marginTop: 6, borderRadius: "50%", background: n.isRead ? "transparent" : "var(--accent)", flexShrink: 0 }} aria-hidden="true" />
              <span style={{ minWidth: 0 }}>
                {n.subject && <span style={{ display: "block", fontWeight: 700, fontSize: 13 }}>{n.subject}</span>}
                <span style={{ display: "block", fontSize: 13, color: "var(--text-secondary)" }}>{n.message}</span>
                <span style={{ display: "block", fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>
                  {timeAgo(n.createdAt)}
                  {!n.isRead && <span className="visually-hidden"> — non lue</span>}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
