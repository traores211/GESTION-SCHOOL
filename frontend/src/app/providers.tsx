"use client";

import { ReactNode } from "react";
import { SessionProvider } from "../lib/session";
import { ToastProvider } from "../components/ui/States";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>{children}</ToastProvider>
    </SessionProvider>
  );
}
