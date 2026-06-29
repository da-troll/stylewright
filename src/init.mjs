import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Fetch + vendor the style source's template and palette library locally, then
 * rewrite the template's remote @import to point at the vendored lib so the Less
 * compiler resolves it offline. Re-run after upstream changes.
 */
export async function init(cfg) {
  const ss = cfg.styleSource;
  const dir = cfg._paths.styleSource;
  await mkdir(dir, { recursive: true });

  const lib = await fetchText(ss.vendor.libUrl);
  const libPath = path.join(dir, ss.vendor.libFile);
  await writeFile(libPath, lib);

  let template = await fetchText(ss.vendor.templateUrl);
  if (ss.vendor.rewriteImport) {
    const { from, to } = ss.vendor.rewriteImport;
    if (!template.includes(from)) {
      console.warn(
        `[init] WARN: rewriteImport.from not found in template:\n  ${from}\n` +
          `  The template's @import may already differ — check ${ss.vendor.templateFile}.`,
      );
    }
    template = template.split(from).join(to);
  }
  const templatePath = path.join(dir, ss.vendor.templateFile);
  await writeFile(templatePath, template);

  console.log(`[init] Vendored style source "${ss.id}" → ${rel(cfg, dir)}`);
  console.log(`[init]   ${ss.vendor.libFile}      (${lib.length} bytes)`);
  console.log(`[init]   ${ss.vendor.templateFile} (${template.length} bytes, import rewritten → local)`);
  console.log(`[init] Copy the template to start a new style: work/<site>/style${ss.outputExtension}`);
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch ${url} → HTTP ${res.status}`);
  return await res.text();
}

function rel(cfg, p) {
  return path.relative(cfg._paths.root, p) || ".";
}
