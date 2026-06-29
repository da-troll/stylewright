import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { siteSlug } from "./config.mjs";
import { compile } from "./compile.mjs";
import { withPage, gotoSettled } from "./browser.mjs";

/**
 * Compile the userstyle, inject it into the LIVE site, and screenshot the result
 * — the "sighted" half of the loop. One screenshot per configured verify variant
 * (e.g. mocha-dark + latte-light) so flavor coverage is checked every round.
 */
export async function preview(cfg, url, lessFile, opts = {}) {
  const slug = siteSlug(url);
  const outDir = path.join(cfg._paths.work, slug);
  await mkdir(outDir, { recursive: true });

  // Which variants to render: explicit --label filter, else all config verify variants.
  let variants = cfg.styleSource.variants.verify;
  if (opts.label) variants = variants.filter((v) => v.label === opts.label);
  if (!variants.length) {
    throw new Error(`No verify variant matched label "${opts.label}". Known: ${cfg.styleSource.variants.verify.map((v) => v.label).join(", ")}`);
  }

  const shots = [];
  for (const variant of variants) {
    const { css } = await compile(cfg, lessFile, { vars: variant.vars, unwrap: true });

    // Persist the injected CSS for debugging what the browser actually saw.
    const cssPath = path.join(outDir, `preview-${variant.label}.css`);
    await writeFile(cssPath, css);

    const shot = await withPage(
      cfg,
      { ...opts, colorScheme: variant.colorScheme },
      async (page) => {
        await gotoSettled(cfg, page, url);
        await page.addStyleTag({ content: css });
        await page.waitForTimeout(400); // let transitions settle
        const p = path.join(outDir, `preview-${variant.label}.png`);
        await page.screenshot({ path: p, fullPage: cfg.iteration.screenshotFullPage });
        return p;
      },
    );
    shots.push({ label: variant.label, screenshot: shot, css: cssPath });
    console.log(`[preview] ${variant.label} (${variant.colorScheme}) → ${path.relative(cfg._paths.root, shot)}`);
  }
  return { outDir, shots };
}
