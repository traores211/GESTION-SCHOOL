import { afterEach, describe, expect, it, vi } from "vitest";
import { daysInProcess, fullName, pathIndex, relativeTime, statusTone } from "./admissions";
import { formatFCFA, formatPercent } from "./dashboard";
import { statusBadge, INVOICE_STATUS } from "./labels";
import { passwordIssue } from "./password";

describe("password policy (client mirror)", () => {
  it("requires 10 characters with a letter and a digit", () => {
    expect(passwordIssue("court1")).toMatch(/trop court/);
    expect(passwordIssue("seulementdeslettres")).toMatch(/lettre et un chiffre/);
    expect(passwordIssue("1234567890")).toMatch(/lettre et un chiffre/);
    expect(passwordIssue("Rentrée2026")).toBeNull();
  });
});

describe("admission helpers", () => {
  afterEach(() => vi.useRealTimers());

  it("places side steps on the main path", () => {
    expect(pathIndex("CANDIDATURE")).toBe(0);
    expect(pathIndex("DOSSIER_INCOMPLET")).toBe(0);
    expect(pathIndex("ENTRETIEN")).toBe(pathIndex("ETUDE"));
    expect(pathIndex("REJETE")).toBe(pathIndex("ADMIS"));
    expect(pathIndex("CONFIRME")).toBe(5);
  });

  it("gives each status a tone", () => {
    expect(statusTone("REJETE")).toBe("danger");
    expect(statusTone("ADMIS")).toBe("olive");
    expect(statusTone("DOSSIER_INCOMPLET")).toBe("orange");
    expect(statusTone("TEST")).toBe("info");
  });

  it("formats names and durations", () => {
    expect(fullName({ firstName: "Awa", lastName: "Koné" })).toBe("KONÉ Awa");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));
    expect(daysInProcess({ submittedAt: "2026-09-23T12:00:00Z", status: "ETUDE" })).toBe(10);
    // A closed file stops counting at its decision date.
    expect(daysInProcess({ submittedAt: "2026-09-23T12:00:00Z", decidedAt: "2026-09-26T12:00:00Z", status: "REJETE" })).toBe(3);
    expect(relativeTime("2026-10-03T11:59:30Z")).toBe("à l'instant");
    expect(relativeTime("2026-10-01T12:00:00Z")).toBe("avant-hier");
  });
});

describe("number formatting", () => {
  it("formats francs and percentages the French way", () => {
    expect(formatFCFA(1250000).replace(/\s/g, " ")).toMatch(/^1 250 000/);
    expect(formatPercent(null)).toBe("—");
  });

  it("falls back to the raw code for unknown statuses", () => {
    expect(statusBadge(INVOICE_STATUS, "PAID").label).toBeTruthy();
    expect(statusBadge(INVOICE_STATUS, "MYSTERY").label).toBe("MYSTERY");
  });
});
