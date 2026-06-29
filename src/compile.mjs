import { readFile } from "node:fs/promises";
import path from "node:path";
import less from "less";
import { defaultVars } from "./config.mjs";

/**
 * Compile a Less userstyle to plain CSS.
 *
 * @param cfg       loaded config
 * @param lessFile  absolute path to the .user.less being authored
 * @param opts.vars override flavor/accent vars (merged over config defaults)
 * @param opts.unwrap  strip the @-moz-document wrapper (required for browser
 *                     injection — Chromium ignores @-moz-document, so wrapped
 *                     rules would silently never apply)
 * @returns { css }
 */
export async function compile(cfg, lessFile, opts = {}) {
  const vars = { ...defaultVars(cfg), ...(opts.vars || {}) };
  const source = await readFile(lessFile, "utf8");

  let result;
  try {
    result = await less.render(source, {
      filename: lessFile,
      paths: [cfg._paths.styleSource, path.dirname(lessFile)],
      modifyVars: vars,
      math: "parens-division",
    });
  } catch (e) {
    // Less errors carry line/column — surface them cleanly for the loop.
    throw new Error(
      `Less compile failed in ${path.basename(lessFile)} ` +
        `(line ${e.line ?? "?"}, col ${e.column ?? "?"}): ${e.message}`,
    );
  }

  let css = result.css;
  if (opts.unwrap) css = unwrapMozDocument(css);
  return { css };
}

/**
 * Remove @-moz-document wrappers, keeping their inner rules. Brace-counted so
 * nested blocks survive. Handles multiple wrappers in one file.
 */
export function unwrapMozDocument(css) {
  let out = css;
  for (;;) {
    const at = out.indexOf("@-moz-document");
    if (at === -1) break;
    const open = out.indexOf("{", at);
    if (open === -1) break;
    let depth = 0;
    let close = -1;
    for (let i = open; i < out.length; i++) {
      const ch = out[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          close = i;
          break;
        }
      }
    }
    if (close === -1) break; // unbalanced — leave as-is rather than corrupt
    const inner = out.slice(open + 1, close);
    out = out.slice(0, at) + inner + out.slice(close + 1);
  }
  return out;
}
