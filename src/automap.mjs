import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

const MAPS = [
  { regex: /\bon[-_]|_on_|^on_|primary.*foreground|brand.*foreground|cta.*foreground|accent.*foreground|constructive.*foreground|destructive.*foreground/i, role: '@crust' },
  { regex: /success|constructive|confirm|ok|green/i, role: '@green' },
  { regex: /warning|caution|alert|orange|yellow|gold/i, role: '@yellow' },
  { regex: /error|danger|destructive|alert|red/i, role: '@red' },
  { regex: /accent|primary|brand|link|cta|action|highlight|select|focus|active|blue|purple/i, role: '@accent' },
  { regex: /bg-alt|bg-elevation|bg-inset|crust|mantle/i, role: '@mantle' },
  { regex: /card|paper|raised|surface|elevation/i, role: '@surface0' },
  { regex: /bg|background|canvas|window|body/i, role: '@base' },
  { regex: /border|divider|separator|line|stroke|grid/i, role: '@surface2' },
  { regex: /text-secondary|sec|mute|hint|disabled-text|subtext/i, role: '@subtext0' },
  { regex: /text|foreground|fg/i, role: '@text' },
  { regex: /white/i, role: '@text' },
  { regex: /black/i, role: '@crust' },
  { regex: /color/i, role: '@text' }, // color fallback
];

/**
 * Automatically analyze the inspect.json file of a site, extract all color-related
 * CSS variables, and map them to Catppuccin palette roles.
 */
export async function generateAutoMapping(inspectPath) {
  if (!existsSync(inspectPath)) return null;

  let insp;
  try {
    insp = JSON.parse(await readFile(inspectPath, "utf8"));
  } catch {
    return null;
  }

  // Merge rootVars, bodyVars and declaredVars
  const vars = { ...(insp.rootVars || {}), ...(insp.bodyVars || {}) };
  for (const v of insp.declaredVars || []) {
    if (!vars[v]) vars[v] = "";
  }

  const mappings = [];
  const processed = new Set();

  for (const [name, val] of Object.entries(vars)) {
    if (processed.has(name)) continue;

    // Check if it's a color-related variable
    const isColorName = /color|bg|fg|text|border|background|link|accent|brand|primary|success|warning|error|danger|destructive|constructive|active|focus|hover|selected|btn|button|white|black/i.test(name);
    const isColorValue = val && (/^#([0-9a-f]{3,8})$/i.test(val) || /^rgba?\(/i.test(val) || /^(white|black|transparent)$/i.test(val) || /^\d+\s*,\s*\d+\s*,\s*\d+$/i.test(val));

    if (isColorName || isColorValue) {
      const isRgbVar = name.endsWith("_rgb") || name.endsWith("-rgb") || name.endsWith("-RGB") || name.endsWith("_RGB");
      let baseName = name;
      if (isRgbVar) {
        baseName = name.replace(/[-_]rgb$/i, "");
      }

      // Strip common namespace prefixes to prevent matching namespace words like "color"
      const cleanName = baseName.replace(/^--?(bui_|ui_|theme_|color[-_])+/i, "");

      let role = null;
      for (const map of MAPS) {
        if (map.regex.test(cleanName)) {
          role = map.role;
          break;
        }
      }

      if (role) {
        if (isRgbVar) {
          mappings.push(`      ${name}: red(${role}), green(${role}), blue(${role});`);
        } else {
          mappings.push(`      ${name}: ${role};`);
        }
        processed.add(name);
      }
    }
  }

  if (!mappings.length) return null;

  return mappings.sort().join("\n");
}
