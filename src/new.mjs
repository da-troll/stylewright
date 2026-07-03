import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { siteSlug } from "./config.mjs";

/**
 * Scaffold work/<site>/style.user.less from the vendored template with the
 * mechanical edits already made: placeholder substitution (domain, site name —
 * config-driven via styleSource.vendor.placeholders) and starter rules at the
 * authoring marker so the very first `preview` visibly applies the palette.
 * The creative work (mapping the site's real selectors) still happens by hand
 * or by the agent loop in CLAUDE.md — this just removes the no-op trap.
 */
export async function newStyle(cfg, url, opts = {}) {
  const ss = cfg.styleSource;
  const slug = siteSlug(url);
  const outDir = path.join(cfg._paths.work, slug);
  await mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, `style${ss.outputExtension}`);
  if (existsSync(outFile) && !opts.force) {
    throw new Error(`${relRoot(cfg, outFile)} already exists — pass --force to overwrite`);
  }

  const templatePath = path.join(cfg._paths.styleSource, ss.vendor.templateFile);
  if (!existsSync(templatePath)) {
    throw new Error(`no vendored template at ${relRoot(cfg, templatePath)} — run \`stylewright init\` first`);
  }
  let text = await readFile(templatePath, "utf8");

  const host = new URL(url).host;
  const domain = host.replace(/^www\./, "");
  const tokens = { "{host}": host, "{domain}": domain, "{site}": domain.split(".")[0] };

  // 1. Placeholder substitution — the map lives in config so other style
  //    sources define their own placeholders (or none).
  let subs = 0;
  for (const [placeholder, token] of Object.entries(ss.vendor.placeholders || {})) {
    if (!text.includes(placeholder)) continue;
    text = text.split(placeholder).join(tokens[token] ?? token);
    subs++;
  }

  // Check for auto-generated variable mappings
  const inspectPath = path.join(outDir, "inspect.json");
  let autoMappings = null;
  if (existsSync(inspectPath)) {
    const { generateAutoMapping } = await import("./automap.mjs");
    autoMappings = await generateAutoMapping(inspectPath);
  }

  // 2. Starter rules or auto-generated mappings at the authoring marker — makes
  //    the first preview visibly themed instead of a silent no-op.
  let seeded = false;
  const marker = ss.vendor.startMarker;
  if (marker && text.includes(marker)) {
    const indent = (text.split(marker)[0].match(/([ \t]*)$/) || [, ""])[1];
    let rules = "";
    if (autoMappings) {
      rules = `${indent}&, body, [data-theme], [data-bui-theme], [class*="theme-"] {\n` +
              `${autoMappings}\n` +
              `${indent}}\n\n` +
              `${indent}body {\n` +
              `${indent}  background-color: @base !important;\n` +
              `${indent}  color: @text !important;\n` +
              `${indent}}\n` +
              `${indent}a {\n` +
              `${indent}  color: @accent !important;\n` +
              `${indent}}`;
    } else if (ss.vendor.starterRules?.length) {
      rules = ss.vendor.starterRules.map((r) => indent + r).join("\n");
    }

    if (rules) {
      text = text.replace(marker, `${marker}\n${rules}`);
      // Drop the template's bare example declaration if present right after the
      // marker (the starter rules supersede it).
      text = text.replace(`${rules}\n${indent}background-color: @base;`, rules);
      seeded = true;
    }
  }

  await writeFile(outFile, text);
  console.log(`[new] ${relRoot(cfg, outFile)}`);
  console.log(`[new]   placeholders filled: ${subs} (domain → ${domain})`);
  console.log(`[new]   starter rules: ${seeded ? (autoMappings ? "auto-mapped from inspect.json" : "seeded from config") : "marker not found, seed by hand"}`);

  // Strategy hint from inspect.json when available.
  if (existsSync(inspectPath)) {
    try {
      const insp = JSON.parse(await readFile(inspectPath, "utf8"));
      const attrs = insp.themeAttrs || {};
      const hasToggle = attrs.dataTheme || /theme|dark|light/i.test(attrs.htmlClass || "");
      console.log(
        hasToggle
          ? `[new]   theme toggle detected (${attrs.dataTheme ? `data-theme="${attrs.dataTheme}"` : `html.class="${attrs.htmlClass}"`}) — use the attribute strategy in the template, delete the prefers-color-scheme block`
          : `[new]   no theme toggle detected — the prefers-color-scheme block is the active strategy (the data-theme blocks never match; delete them for tidiness)`,
      );
    } catch { /* hint only — never block scaffolding */ }
  } else {
    console.log(`[new]   tip: run \`stylewright inspect ${url}\` for a theme-strategy hint + selector map`);
  }
  console.log(`[new] Next: node bin/stylewright.mjs preview ${url} ${relRoot(cfg, outFile)}`);
}

function relRoot(cfg, p) {
  return path.relative(path.dirname(cfg._paths.work), p);
}
