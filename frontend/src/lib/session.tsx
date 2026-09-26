"use client";

import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { api } from "./api";
import { getToken } from "./auth";

export interface SchoolBranding {
  id: string;
  name: string;
  code: string;
  plan: string;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  fontFamily: string | null;
}

export interface Me {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  mfaEnabled: boolean;
  permissions: string[];
  features: string[];
  school: SchoolBranding | null;
}

interface SessionValue {
  me: Me | null;
  loading: boolean;
  can: (permission: string) => boolean;
  hasFeature: (feature: string) => boolean;
  refresh: () => void;
}

const SessionContext = createContext<SessionValue>({
  me: null,
  loading: true,
  can: () => false,
  hasFeature: () => false,
  refresh: () => {},
});

/** Applies the school's brand colors to the design tokens (white-label). */
function applyBranding(school: SchoolBranding | null) {
  const root = document.documentElement.style;
  const hex = /^#[0-9a-f]{6}$/i;
  if (school?.primaryColor && hex.test(school.primaryColor)) root.setProperty("--brand", school.primaryColor);
  else root.removeProperty("--brand");
  if (school?.secondaryColor && hex.test(school.secondaryColor)) root.setProperty("--accent", school.secondaryColor);
  else root.removeProperty("--accent");
}

/**
 * Loads /users/me once per page: permissions and features only drive what the UI SHOWS.
 * The server enforces the same rules on every request regardless.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api
      .get<Me>("/users/me")
      .then((data) => {
        setMe(data);
        applyBranding(data.school);
      })
      .catch(() => setMe(null))
      .finally(() => setLoading(false));
  }, [tick]);

  const value: SessionValue = {
    me,
    loading,
    can: (p) => Boolean(me?.permissions.includes(p)),
    hasFeature: (f) => Boolean(me?.features.includes(f)),
    refresh: () => setTick((t) => t + 1),
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);
