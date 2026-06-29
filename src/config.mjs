import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");

/**
 * Load stylewright.config.json. Path is overridable via STYLEWRIGHT_CONFIG so a
 * caller can point at an alternate style-source config without editing the
 * default one (interoperability: keep several configs side by side).
 */
export async function loadConfig() {
  const configPath =
    process.env.STYLEWRIGHT_CONFIG || path.join(ROOT, "stylewright.config.json");
  if (!existsSync(configPath)) {
    throw new Error(`Config not found: ${configPath}`);
  }
  const cfg = JSON.parse(await readFile(configPath, "utf8"));
  validate(cfg, configPath);
  cfg._paths = {
    root: ROOT,
    config: configPath,
    styleSource: path.join(ROOT, "style-source"),
    work: path.join(ROOT, "work"),
  };
  return cfg;
}

function validate(cfg, configPath) {
  const ss = cfg.styleSource;
  if (!ss) throw new Error(`Missing styleSource in ${configPath}`);
  for (const k of ["id", "preprocessor", "outputExtension", "vendor", "variants"]) {
    if (!(k in ss)) throw new Error(`styleSource.${k} missing in ${configPath}`);
  }
  if (ss.preprocessor !== "less") {
    // Compilation today is Less-only. Other preprocessors (stylus, scss) would
    // slot in at src/compile.mjs behind this switch — fail loud rather than
    // silently producing wrong CSS.
    throw new Error(
      `styleSource.preprocessor "${ss.preprocessor}" not supported yet (only "less"). ` +
        `Add a compiler branch in src/compile.mjs.`,
    );
  }
  for (const k of ["templateUrl", "libUrl", "templateFile", "libFile"]) {
    if (!ss.vendor[k]) throw new Error(`styleSource.vendor.${k} missing in ${configPath}`);
  }
}

/** Default flavor/accent vars (the `default` of each variant var). */
export function defaultVars(cfg) {
  const out = {};
  for (const [name, spec] of Object.entries(cfg.styleSource.variants.vars)) {
    out[name] = spec.default;
  }
  return out;
}

/** Slug a URL host+path into a filesystem-safe working-dir name. */
export function siteSlug(rawUrl) {
  const u = new URL(rawUrl);
  const base = (u.host + u.pathname).replace(/\/+$/, "");
  return base.replace(/[^a-z0-9._-]+/gi, "-").toLowerCase() || "site";
}
