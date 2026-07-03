import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

/**
 * Analyze a site's inspect.json, find its color-typed CSS custom properties,
 * and map them to palette roles. The name→role pattern table lives in config
 * (styleSource.automap.roles) — the harness stays style-source-agnostic.
 *
 * Two gates keep this from wrecking sites:
 *  - VALUE gate: a var with a recorded value is only mapped when that value
 *    parses as a color. Kills name-trap mappings like --bui_border_radius_*
 *    (name says "border", value says 9999px).
 *  - AMBIGUITY gate: raw hue/neutral names (white, black, gray-500, blue-600)
 *    are direction-dependent (a site's "white" must flip meaning between
 *    latte and mocha) — they're skipped and reported, not guessed.
 */
export async function generateAutoMapping(cfg, inspectPath) {
  const am = cfg.styleSource.automap;
  if (!am?.roles?.length || !existsSync(inspectPath)) return null;

  let insp;
  try {
    insp = JSON.parse(await readFile(inspectPath, "utf8"));
  } catch {
    return null;
  }

  const vars = { ...(insp.rootVars || {}), ...(insp.bodyVars || {}) };
  for (const v of insp.declaredVars || []) if (!(v in vars)) vars[v] = "";

  const roles = am.roles.map((r) => ({ regex: new RegExp(r.match, "i"), role: r.role }));
  const skip = (am.skip || []).map((p) => new RegExp(p, "i"));
  const stripPrefix = am.stripPrefix ? new RegExp(am.stripPrefix, "i") : null;

  const mapped = [];
  const skipped = [];

  for (const [name, val] of Object.entries(vars)) {
    const hasValue = val !== "" && val != null;
    // VALUE gate: recorded non-color values are never color-mapped.
    if (hasValue && !isColorValue(val)) continue;
    // Valueless (declared-only) vars need an explicit color-ish name to qualify.
    if (!hasValue && !/color|foreground|background/i.test(name)) continue;

    const isRgbTriple = /[-_]rgb$/i.test(name) || (hasValue && /^\d+\s*,\s*\d+\s*,\s*\d+$/.test(String(val).trim()));
    const cleanName = applyStrip(name.replace(/[-_]rgb$/i, ""), stripPrefix);

    if (skip.some((re) => re.test(cleanName))) {
      skipped.push(name);
      continue;
    }

    const hit = roles.find((r) => r.regex.test(cleanName));
    if (!hit) {
      skipped.push(name);
      continue;
    }

    // Preserve the site's alpha: a 6%-alpha hover wash mapped to a solid
    // color turns every hover state into an opaque block. fade() re-applies
    // the original opacity to the mapped role.
    const alpha = hasValue ? parseAlpha(val) : 1;
    const role = alpha < 0.99 ? `fade(${hit.role}, ${Math.round(alpha * 100)}%)` : hit.role;

    mapped.push(
      isRgbTriple
        ? `${name}: red(${hit.role}), green(${hit.role}), blue(${hit.role});`
        : `${name}: ${role};`,
    );
  }

  if (!mapped.length) return null;
  return { rules: mapped.sort(), skipped: skipped.sort() };
}

function applyStrip(name, stripPrefix) {
  let n = name.replace(/^--/, "");
  if (stripPrefix) {
    let prev;
    do {
      prev = n;
      n = n.replace(stripPrefix, "");
    } while (n !== prev);
  }
  return n;
}

/** Extract the alpha channel from a color value (1 when opaque/unknown). */
function parseAlpha(raw) {
  const v = String(raw).trim();
  let m = v.match(/^#[0-9a-f]{8}$/i);
  if (m) return parseInt(v.slice(7, 9), 16) / 255;
  m = v.match(/^#[0-9a-f]{4}$/i);
  if (m) return parseInt(v[4] + v[4], 16) / 255;
  m = v.match(/^rgba?\([^)]+[,/]\s*(0?\.\d+|0|1)\s*\)$/i);
  if (m && v.split(",").length >= 4 || (m && v.includes("/"))) return parseFloat(m[1]);
  return 1;
}

/** Loose color-value check: hex, rgb()/hsl()/oklch()/color-mix(), named, or a bare r,g,b triple. */
function isColorValue(raw) {
  const v = String(raw).trim();
  return (
    /^#[0-9a-f]{3,8}$/i.test(v) ||
    /^(rgba?|hsla?|oklch|oklab|lab|lch|color|color-mix)\(/i.test(v) ||
    /^(white|black|transparent|currentcolor)$/i.test(v) ||
    /^\d+\s*,\s*\d+\s*,\s*\d+$/.test(v)
  );
}
