"use client";

import { useEffect, useId, useRef, useState } from "react";
import { api } from "../lib/api";
import Icon from "./ui/Icon";

interface Notification {
  id: string;
  subject: string | null;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const loadCount = () => {
    api
      .get<number>("/notifications/unread-count")
      .then(setUnread)
      .catch(() => {});
  };

  const loadList = () => {
    api
      .get<Notification[]>("/notifications")
      .then(setItems)
      .catch(() => {});
  };

  useEffect(() => {
    loadCount();
    const interval = setInterval(loadCount, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const toggle = () => {
    if (!open) loadList();
    setOpen((o) => !o);
  };

  const markRead = async (id: string) => {
    await api.patch(`/notifications/${id}/read`);
    loadList();
    loadCount();
  };

  const markAllRead = async () => {
    await api.patch("/notifications/mark-all-read");
    loadList();
    loadCount();
  };

  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button
        type="button"
        className="btn btn-ghost btn-icon"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={unread > 0 ? `Notifications, ${unread} non lue(s)` : "Notifications"}
        style={{ position: "relative" }}
      >
        <Icon name="bell" />
        {unread > 0 && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              background: "var(--danger)",
              color: "#fff",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 700,
              minWidth: 16,
              height: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 3px",
            }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          className="card"
          role="region"
          aria-label="Notifications"
          style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: "min(360px, 92vw)", maxHeight: 440, overflowY: "auto", padding: 0, zIndex: 50 }}
        >
          <div className="row" style={{ justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
            <strong>Notifications</strong>
            {unread > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={markAllRead}>
                Tout marquer comme lu
              </button>
            )}
          </div>
          {items.length === 0 && <p className="muted" style={{ padding: 16 }}>Aucune notification.</p>}
          <ul style={{ listStyle: "none" }}>
            {items.map((n) => (
              <li key={n.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <button
                  type="button"
                  onClick={() => !n.isRead && markRead(n.id)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    border: 0,
                    padding: "10px 16px",
                    background: n.isRead ? "transparent" : "var(--brand-soft)",
                    color: "var(--text)",
                    cursor: n.isRead ? "default" : "pointer",
                  }}
                >
                  {n.subject && <div style={{ fontWeight: 600, fontSize: 13.5 }}>{n.subject}</div>}
                  <div className="muted" style={{ fontSize: 13.5 }}>{n.message}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    {new Date(n.createdAt).toLocaleString("fr-FR")}
                    {!n.isRead && <span className="sr-only"> — non lue, activer pour marquer comme lue</span>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
