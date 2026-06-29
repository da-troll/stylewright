import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { siteSlug } from "./config.mjs";
import { withPage, gotoSettled } from "./browser.mjs";

/**
 * Load the LIVE rendered site and dump the inputs an LLM actually needs to write
 * a userstyle: the site's own CSS custom properties (the high-leverage remap
 * target), a structural sample of prominent selectors, and baseline screenshots.
 */
export async function inspect(cfg, url, opts = {}) {
  const slug = siteSlug(url);
  const outDir = path.join(cfg._paths.work, slug);
  await mkdir(outDir, { recursive: true });

  const result = await withPage(cfg, opts, async (page) => {
    await gotoSettled(cfg, page, url);

    const data = await page.evaluate(() => {
      const customProps = (el) => {
        const out = {};
        const cs = getComputedStyle(el);
        for (let i = 0; i < cs.length; i++) {
          const p = cs[i];
          if (p.startsWith("--")) out[p] = cs.getPropertyValue(p).trim();
        }
        return out;
      };

      // Author-declared custom properties scanned from same-origin stylesheets
      // (cross-origin sheets throw on .cssRules — skipped silently).
      const declaredVars = new Set();
      for (const sheet of Array.from(document.styleSheets)) {
        let rules;
        try {
          rules = sheet.cssRules;
        } catch {
          continue;
        }
        const walk = (ruleList) => {
          for (const r of Array.from(ruleList || [])) {
            if (r.style) {
              for (let i = 0; i < r.style.length; i++) {
                const p = r.style[i];
                if (p.startsWith("--")) declaredVars.add(p);
              }
            }
            if (r.cssRules) walk(r.cssRules);
          }
        };
        walk(rules);
      }

      // Prominent class names by frequency — gives the LLM real selectors to target.
      const classFreq = {};
      for (const el of Array.from(document.querySelectorAll("[class]")).slice(0, 4000)) {
        for (const c of el.classList) classFreq[c] = (classFreq[c] || 0) + 1;
      }
      const topClasses = Object.entries(classFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 60)
        .map(([c, n]) => ({ class: c, count: n }));

      const bodyCs = getComputedStyle(document.body);
      return {
        title: document.title,
        url: location.href,
        themeAttrs: {
          htmlClass: document.documentElement.className,
          htmlDataTheme: document.documentElement.getAttribute("data-theme"),
          bodyClass: document.body.className,
        },
        rootVars: customProps(document.documentElement),
        bodyVars: customProps(document.body),
        declaredVars: Array.from(declaredVars).sort(),
        baselineColors: {
          bodyBackground: bodyCs.backgroundColor,
          bodyColor: bodyCs.color,
          linkColor: (() => {
            const a = document.querySelector("a");
            return a ? getComputedStyle(a).color : null;
          })(),
        },
        topClasses,
      };
    });

    const shot = path.join(outDir, `baseline-${opts.colorScheme || "dark"}.png`);
    await page.screenshot({ path: shot, fullPage: cfg.iteration.screenshotFullPage });
    return { data, shot };
  });

  const varsPath = path.join(outDir, "inspect.json");
  await writeFile(varsPath, JSON.stringify(result.data, null, 2));

  console.log(`[inspect] ${url}`);
  console.log(`[inspect]   title: ${result.data.title}`);
  console.log(`[inspect]   :root custom props: ${Object.keys(result.data.rootVars).length}`);
  console.log(`[inspect]   author-declared --vars: ${result.data.declaredVars.length}`);
  console.log(`[inspect]   theme attrs: html.class="${result.data.themeAttrs.htmlClass}" data-theme=${result.data.themeAttrs.htmlDataTheme}`);
  console.log(`[inspect]   → ${path.relative(cfg._paths.root, varsPath)}`);
  console.log(`[inspect]   → ${path.relative(cfg._paths.root, result.shot)} (baseline)`);
  return { outDir, varsPath, screenshot: result.shot };
}
