import { chromium } from "playwright";
import { existsSync } from "node:fs";

/**
 * Launch a browser + context per the config. Uses the installed Chrome channel
 * when available (so it can run against the user's real, logged-in profile via
 * storageState), falling back to bundled Chromium.
 */
export async function withPage(cfg, opts, fn) {
  const b = cfg.browser;
  const launchOpts = { headless: !b.headed };
  if (b.channel) launchOpts.channel = b.channel;

  let browser;
  try {
    browser = await chromium.launch(launchOpts);
  } catch (e) {
    if (b.channel) {
      console.warn(`[browser] channel "${b.channel}" unavailable — falling back to bundled Chromium.`);
      browser = await chromium.launch({ headless: !b.headed });
    } else {
      throw e;
    }
  }

  const ctxOpts = {
    viewport: b.viewport,
    deviceScaleFactor: b.deviceScaleFactor || 1,
    colorScheme: opts.colorScheme || "dark",
  };
  const storage = opts.storageStatePath || b.storageStatePath;
  if (storage && existsSync(storage)) ctxOpts.storageState = storage;

  const context = await browser.newContext(ctxOpts);
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(b.navigationTimeoutMs || 45000);

  try {
    return await fn(page, context);
  } finally {
    await context.close();
    await browser.close();
  }
}

export async function gotoSettled(cfg, page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  // Best-effort network idle, then a fixed settle for late CSS-in-JS injection.
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(cfg.browser.settleMs || 1500);
}
