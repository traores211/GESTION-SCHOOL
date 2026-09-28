"use client";

import { ReactNode, useState } from "react";
import { api, ApiError } from "../../lib/api";
import ImageField from "./ImageField";

export type FieldType = "text" | "textarea" | "image" | "url" | "checkbox";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  maxLength?: number;
}

type Item = { id: string; order: number } & Record<string, any>;

/**
 * Generic list editor for a showcase collection (/showcase/<collection>):
 * add / edit in a modal, delete, and reorder with up/down buttons.
 */
export default function CollectionEditor<T extends Item>({
  collection,
  items,
  fields,
  itemLabel,
  emptyText,
  renderItem,
  onChanged,
  layout = "list",
}: {
  collection: "highlights" | "photos" | "partners" | "testimonials";
  items: T[];
  fields: FieldDef[];
  itemLabel: string;
  emptyText: string;
  renderItem: (item: T) => ReactNode;
  onChanged: () => void;
  layout?: "list" | "grid";
}) {
  const [editing, setEditing] = useState<Partial<T> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const blank = () =>
    Object.fromEntries(fields.map((f) => [f.key, f.type === "checkbox" ? true : f.type === "text" || f.type === "textarea" ? "" : null])) as Partial<T>;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const missing = fields.find((f) => f.required && f.type === "image" && !(editing as Record<string, unknown>)[f.key]);
    if (missing) {
      setError(`« ${missing.label} » est obligatoire.`);
      return;
    }
    setSaving(true);
    setError(null);
    const payload: Record<string, unknown> = {};
    for (const f of fields) {
      const value = (editing as Record<string, unknown>)[f.key];
      payload[f.key] = typeof value === "string" ? value.trim() || (f.required ? "" : null) : value;
    }
    try {
      if (editing.id) await api.patch(`/showcase/${collection}/${editing.id}`, payload);
      else await api.post(`/showcase/${collection}`, payload);
      setEditing(null);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: T) => {
    setBusyId(item.id);
    try {
      await api.delete(`/showcase/${collection}/${item.id}`);
      onChanged();
    } finally {
      setBusyId(null);
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    const other = items[index + direction];
    const current = items[index];
    if (!other) return;
    setBusyId(current.id);
    try {
      await Promise.all([
        api.patch(`/showcase/${collection}/${current.id}`, { order: index + direction }),
        api.patch(`/showcase/${collection}/${other.id}`, { order: index }),
      ]);
      onChanged();
    } finally {
      setBusyId(null);
    }
  };

  const set = (key: string, value: unknown) => setEditing((prev) => ({ ...(prev || {}), [key]: value }) as Partial<T>);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => {
            setError(null);
            setEditing(blank());
          }}
        >
          + Ajouter {itemLabel}
        </button>
      </div>

      {items.length === 0 ? (
        <div className="card">
          <div className="state">
            <span className="state-icon" aria-hidden="true">∅</span>
            <div className="state-title">{emptyText}</div>
            <div>Cette section reste masquée sur la vitrine tant qu&apos;elle est vide.</div>
          </div>
        </div>
      ) : (
        <div
          style={
            layout === "grid"
              ? { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }
              : { display: "grid", gap: 10 }
          }
        >
          {items.map((item, index) => (
            <div
              key={item.id}
              className="card"
              style={{ padding: 14, display: "flex", flexDirection: layout === "grid" ? "column" : "row", gap: 12, alignItems: layout === "grid" ? "stretch" : "center", opacity: busyId === item.id ? 0.6 : 1 }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>{renderItem(item)}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button className="btn btn-outline btn-sm" aria-label="Monter" disabled={index === 0 || !!busyId} onClick={() => move(index, -1)}>
                  ↑
                </button>
                <button
                  className="btn btn-outline btn-sm"
                  aria-label="Descendre"
                  disabled={index === items.length - 1 || !!busyId}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    setError(null);
                    setEditing(item);
                  }}
                >
                  Modifier
                </button>
                <button className="btn btn-outline btn-sm" disabled={!!busyId} onClick={() => remove(item)} style={{ color: "var(--danger)" }}>
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <h2 style={{ fontSize: 17, marginBottom: 16 }}>
              {editing.id ? "Modifier" : "Ajouter"} {itemLabel}
            </h2>
            <form onSubmit={save}>
              {fields.map((f) => {
                const value = (editing as Record<string, any>)[f.key];
                const id = `f-${collection}-${f.key}`;
                if (f.type === "image") {
                  return (
                    <ImageField key={f.key} id={id} label={f.label + (f.required ? " *" : "")} value={value ?? null} hint={f.hint} onChange={(v) => set(f.key, v)} />
                  );
                }
                if (f.type === "checkbox") {
                  return (
                    <label key={f.key} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, fontSize: 14 }}>
                      <input type="checkbox" checked={!!value} onChange={(e) => set(f.key, e.target.checked)} />
                      {f.label}
                    </label>
                  );
                }
                return (
                  <div className="field" key={f.key}>
                    <label htmlFor={id}>
                      {f.label}
                      {f.required ? " *" : ""}
                    </label>
                    {f.type === "textarea" ? (
                      <textarea
                        id={id}
                        className="input"
                        rows={4}
                        required={f.required}
                        maxLength={f.maxLength}
                        placeholder={f.placeholder}
                        value={value ?? ""}
                        onChange={(e) => set(f.key, e.target.value)}
                      />
                    ) : (
                      <input
                        id={id}
                        className="input"
                        type={f.type === "url" ? "url" : "text"}
                        required={f.required}
                        maxLength={f.maxLength}
                        placeholder={f.placeholder}
                        value={value ?? ""}
                        onChange={(e) => set(f.key, e.target.value)}
                      />
                    )}
                    {f.hint && <span className="muted" style={{ fontSize: 12 }}>{f.hint}</span>}
                  </div>
                );
              })}
              {error && <p className="text-danger" style={{ fontSize: 13, marginBottom: 10 }}>{error}</p>}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                <button type="button" className="btn btn-outline" onClick={() => setEditing(null)}>
                  Annuler
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Enregistrement…" : "Enregistrer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
