"use client";

import { ReactNode } from "react";
import { BrandMark, FlagBand, ThemeToggle } from "./Brand";
import "../app/login/login.css";

/** Centered card on the sign-in background, for the password pages. */
export default function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main className="login login-single">
      <FlagBand />
      <section className="login-panel">
        <div className="login-panel-tools">
          <ThemeToggle />
        </div>
        <div className="login-card">
          <div className="login-head">
            <div className="login-brand">
              <BrandMark size={28} />
              <strong>School ERP</strong>
            </div>
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
