"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

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
    const interval = setInterval(loadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

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
        className="btn btn-outline btn-sm"
        onClick={toggle}
        style={{ position: "relative", padding: "8px 10px" }}
        aria-label="Notifications"
      >
        🔔
        {unread > 0 && (
          <span
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              background: "var(--ci-orange)",
              color: "#fff",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 800,
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
          className="card"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            width: 340,
            maxHeight: 420,
            overflowY: "auto",
            padding: 0,
            zIndex: 50,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
            <strong style={{ fontSize: 13 }}>Notifications</strong>
            {unread > 0 && (
              <button className="btn btn-outline btn-sm" style={{ padding: "4px 8px", fontSize: 11 }} onClick={markAllRead}>
                Tout marquer lu
              </button>
            )}
          </div>
          {items.length === 0 && <p className="muted" style={{ padding: 16, fontSize: 12.5 }}>Aucune notification.</p>}
          {items.map((n) => (
            <div
              key={n.id}
              onClick={() => !n.isRead && markRead(n.id)}
              style={{
                padding: "10px 16px",
                borderBottom: "1px solid var(--border)",
                background: n.isRead ? "transparent" : "var(--ci-green-light)",
                cursor: n.isRead ? "default" : "pointer",
              }}
            >
              {n.subject && <div style={{ fontWeight: 700, fontSize: 12.5 }}>{n.subject}</div>}
              <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{n.message}</div>
              <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 2 }}>
                {new Date(n.createdAt).toLocaleString("fr-FR")}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
