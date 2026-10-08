import { afterEach, describe, expect, it, vi } from "vitest";
import { getLang, setLang, translate, translatedCount } from "./i18n";

describe("interface language", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("translates known texts and keeps the French source otherwise", () => {
    expect(translate("Tableau de bord", "en")).toBe("Dashboard");
    expect(translate("Tableau de bord", "fr")).toBe("Tableau de bord");
    expect(translate("Un texte pas encore traduit", "en")).toBe("Un texte pas encore traduit");
    expect(translatedCount).toBeGreaterThan(50);
  });

  it("remembers the chosen language and defaults to French", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
    vi.stubGlobal("document", { documentElement: { lang: "fr" } });
    expect(getLang()).toBe("fr");
    setLang("en");
    expect(getLang()).toBe("en");
    expect(document.documentElement.lang).toBe("en");
    store.set("lang", "de");
    expect(getLang()).toBe("fr");
  });

  it("works without storage", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } });
    expect(getLang()).toBe("fr");
    expect(() => setLang("en")).not.toThrow();
  });
});
