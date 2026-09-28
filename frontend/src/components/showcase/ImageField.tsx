"use client";

import { useRef, useState } from "react";
import { api, ApiError } from "../../lib/api";

/** Image input: paste an https:// URL or upload a file (JPEG, PNG, WebP, GIF — 5 Mo max). */
export default function ImageField({
  id,
  label,
  value,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = api.mediaUrl(value);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (file.size > 5 * 1024 * 1024) {
      setError("Image trop lourde (5 Mo maximum).");
      return;
    }
    setUploading(true);
    try {
      const res = await api.upload<{ url: string }>("/showcase/uploads", file);
      onChange(res.url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Échec du téléversement.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "var(--surface-muted)",
            overflow: "hidden",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-muted)",
            fontSize: 22,
          }}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <span aria-hidden="true">🖼️</span>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 6 }}>
          <input
            id={id}
            className="input"
            placeholder="https://… ou téléverser une image"
            value={value || ""}
            onChange={(e) => onChange(e.target.value.trim() || null)}
          />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
              {uploading ? "Téléversement…" : "⬆ Téléverser"}
            </button>
            {value && (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => onChange(null)}>
                Retirer
              </button>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            hidden
            onChange={(e) => upload(e.target.files?.[0])}
          />
          {hint && !error && <span className="muted" style={{ fontSize: 12 }}>{hint}</span>}
          {error && <span className="text-danger" style={{ fontSize: 12.5 }}>{error}</span>}
        </div>
      </div>
    </div>
  );
}
