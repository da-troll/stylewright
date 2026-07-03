#!/usr/bin/env node
import { loadConfig } from "../src/config.mjs";
import { init } from "../src/init.mjs";
import { inspect } from "../src/inspect.mjs";
import { newStyle } from "../src/new.mjs";
import { preview } from "../src/preview.mjs";
import { compile } from "../src/compile.mjs";
import { writeFile } from "node:fs/promises";

const HELP = `stylewright — generate browser userstyles for any site, against any style source

USAGE
  stylewright init
      Fetch + vendor the configured style source's template & palette lib.

  stylewright inspect <url> [--scheme dark|light] [--storage <file>]
      Load the LIVE site; dump CSS custom props, selectors, baseline screenshot
      → work/<site>/inspect.json + baseline-*.png

  stylewright new <url> [--force]
      Scaffold work/<site>/style.user.less from the vendored template with the
      domain + metadata placeholders filled and visible starter rules seeded.

  stylewright preview <url> <style.user.less> [--label <variant>] [--storage <file>]
      Compile the style, inject into the live site, screenshot each verify variant
      → work/<site>/preview-<variant>.png

  stylewright compile <style.user.less> [--out <file.css>] [--unwrap]
      [--var name=value ...]   (e.g. --var darkFlavor=mocha --var accentColor=blue)
      Compile Less → CSS standalone.

CONFIG
  Edit stylewright.config.json (or point STYLEWRIGHT_CONFIG at another file) to
  swap the style source. See README.md → "Using a different style source".
`;

function parseFlags(args) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--var") {
      const [k, ...rest] = (args[++i] || "").split("=");
      flags.vars = flags.vars || {};
      flags.vars[k] = rest.join("=");
    } else if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next === undefined || next.startsWith("--")) flags[key] = true;
      else flags[key] = args[++i];
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    console.log(HELP);
    process.exit(cmd ? 0 : 1);
  }

  const { flags, positional } = parseFlags(rest);
  const cfg = await loadConfig();

  switch (cmd) {
    case "init":
      await init(cfg);
      break;

    case "inspect": {
      const url = positional[0];
      if (!url) die("inspect needs a <url>");
      await inspect(cfg, url, {
        colorScheme: flags.scheme,
        storageStatePath: flags.storage,
      });
      break;
    }

    case "new": {
      const url = positional[0];
      if (!url) die("new needs a <url>");
      await newStyle(cfg, url, { force: !!flags.force });
      break;
    }

    case "preview": {
      const [url, lessFile] = positional;
      if (!url || !lessFile) die("preview needs <url> <style.user.less>");
      await preview(cfg, url, lessFile, {
        label: flags.label,
        storageStatePath: flags.storage,
      });
      break;
    }

    case "compile": {
      const lessFile = positional[0];
      if (!lessFile) die("compile needs <style.user.less>");
      const { css } = await compile(cfg, lessFile, {
        vars: flags.vars,
        unwrap: !!flags.unwrap,
      });
      if (flags.out) {
        await writeFile(flags.out, css);
        console.log(`[compile] → ${flags.out} (${css.length} bytes)`);
      } else {
        process.stdout.write(css);
      }
      break;
    }

    default:
      die(`unknown command "${cmd}"`);
  }
}

function die(msg) {
  console.error(`stylewright: ${msg}\n`);
  console.error(HELP);
  process.exit(1);
}

main().catch((e) => {
  console.error(`stylewright: ${e.message}`);
  process.exit(1);
});
