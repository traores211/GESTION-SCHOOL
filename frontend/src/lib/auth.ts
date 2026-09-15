export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

const TOKEN_KEY = "schoolerp_token";
const USER_KEY = "schoolerp_user";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: AuthUser) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // ignore storage errors (private browsing, etc.)
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    // ignore
  }
}

export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Administrateur",
  ADMIN_ORGANISATION: "Administrateur",
  DIRECTOR: "Directeur",
  SECRETARY: "Secrétaire",
  COMPTABLE: "Comptable",
  ENSEIGNANT: "Enseignant",
  ELEVE: "Élève",
  PARENT: "Parent",
};
