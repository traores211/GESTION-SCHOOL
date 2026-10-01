import { ApiError, api } from "./api";
import { getToken } from "./auth";

/** Downloads an authenticated file (PDF bulletins, payslips) and reports API errors instead of saving them. */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const res = await fetch(api.fileUrl(path), { headers: { Authorization: `Bearer ${getToken() ?? ""}` } });
  if (!res.ok) {
    let message = `Erreur ${res.status}`;
    try {
      const body = await res.json();
      message = body?.message || message;
    } catch {
      // not JSON
    }
    throw new ApiError(Array.isArray(message) ? message.join(", ") : message, res.status);
  }
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const name = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
