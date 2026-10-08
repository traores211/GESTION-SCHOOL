import { expect, setOffline, signIn, test } from "./fixtures";

test("a roll call taken without network is kept on the device and sent when the network is back", async ({ page }) => {
  await signIn(page);
  await page.goto("/attendance");
  const save = page.getByRole("button", { name: "Enregistrer l'appel" });
  await expect(save).toBeVisible({ timeout: 30_000 });

  await setOffline(page, true);
  await save.click();
  await expect(page.getByText("Appel conservé sur cet appareil")).toBeVisible();
  await expect(page.getByText(/1 appel\(s\) conservé\(s\) sur cet appareil/)).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("schoolerp_offline_rollcalls") ?? "[]").length)).toBe(1);

  await setOffline(page, false);
  await expect(page.getByText("1 appel(s) envoyé(s)")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/conservé\(s\) sur cet appareil, envoyé/)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("schoolerp_offline_rollcalls"))).toBeNull();
});

test("the app declares itself installable", async ({ page }) => {
  await page.goto("/login");
  const manifestUrl = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(manifestUrl).toBe("/manifest.webmanifest");
  const manifest = await (await page.request.get(manifestUrl!)).json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.some((i: { sizes: string }) => i.sizes === "512x512")).toBe(true);
  for (const icon of ["/icons/icon-192.png", "/icons/icon-512.png", "/sw.js", "/offline.html"]) {
    expect((await page.request.get(icon)).status(), icon).toBe(200);
  }
});
