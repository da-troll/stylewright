# stylewright

Generate browser **userstyles** (themes) for any website using a single Claude
Code instance — no division of labor. One agent inspects the live site, writes the
style, compiles it, injects it into a real browser, screenshots the result, and
iterates until it looks right. [Catppuccin](https://github.com/catppuccin/userstyles)
is the default style source, but it's fully swappable.

The harness gives the model **eyes and hands** (Playwright + a Less compiler); the
model supplies the brain (reading the live DOM, mapping colors, critiquing
screenshots). That closes the loop an LLM normally can't do alone — see
[CLAUDE.md](./CLAUDE.md) for the operating loop.

## Why not just "save the page + ask an LLM"?

A saved page is a dead snapshot — it loses CSS-in-JS, hover/focus states, modals,
shadow DOM, and logged-in views, and the LLM is blind to the rendered result.
stylewright works against the **live, rendered** site and feeds the model its own
screenshots, turning a blind one-shot into sighted iteration.

## Setup

```bash
npm install
npx playwright install chromium        # or use the system Chrome (config: browser.channel)
node bin/stylewright.mjs init          # vendor the template + palette lib
```

## Usage

```bash
# 1. inspect the live site → work/<site>/inspect.json + baseline screenshot
node bin/stylewright.mjs inspect https://example.com --scheme dark

# 2. author work/<site>/style.user.less (start from style-source/template.user.less)

# 3. compile + inject + screenshot each flavor variant
node bin/stylewright.mjs preview https://example.com work/<site>/style.user.less

# 4. look at work/<site>/preview-*.png, fix, repeat

# 5. compile a flat CSS build if you want one
node bin/stylewright.mjs compile work/<site>/style.user.less --var darkFlavor=mocha --out out.css
```

For logged-in sites, export a Playwright `storageState` once and pass
`--storage session.storage.json` to `inspect`/`preview`.

The deliverable is `work/<site>/style.user.less` — a valid Stylus UserCSS file
(keeps the flavor/accent picker). Install it in Stylus once.

## Commands

| Command | What it does |
|---|---|
| `init` | Fetch + vendor the style source's template & palette lib; rewrite the remote `@import` to local. |
| `inspect <url>` | Load the live site; dump CSS custom props, top selectors, theme attrs, baseline screenshot. |
| `preview <url> <less>` | Compile + inject + screenshot each verify variant against the live site. |
| `compile <less>` | Compile Less → CSS standalone (`--var k=v`, `--out`, `--unwrap`). |

## Using a different style source

Everything style-specific lives in `stylewright.config.json → styleSource`. The
code never hardcodes Catppuccin. To target another style repo:

1. Point `vendor.templateUrl` / `vendor.libUrl` at the new repo's template and
   palette library.
2. Set `vendor.rewriteImport` so the template's remote `@import` is rewritten to
   the vendored lib filename (or drop it if the template imports relatively).
3. Replace `variants.vars` with that source's selectable variables (flavors,
   accents, modes…) and `variants.verify` with the variant/color-scheme pairs you
   want screenshotted each round.
4. Replace `palette.names` and `palette.roleHints` with the new palette's color
   names and your role→color guidance (this is what the agent maps against).
5. Re-run `node bin/stylewright.mjs init`.

You can keep several configs side by side and select one per run with
`STYLEWRIGHT_CONFIG=./configs/dracula.json node bin/stylewright.mjs …`.

> Note: the compiler is currently Less-only (matching Catppuccin). A different
> preprocessor (Stylus, SCSS) is a compiler branch in `src/compile.mjs`; the
> config validation fails loud until that branch exists.

## Layout

```
stylewright/
├── bin/
│   └── stylewright.mjs        CLI dispatcher
├── src/
│   ├── config.mjs             config load + validation
│   ├── init.mjs               vendor template + lib
│   ├── inspect.mjs            live-DOM var/selector dump + baseline screenshot
│   ├── compile.mjs            Less → CSS (+ @-moz-document unwrap for injection)
│   ├── preview.mjs            compile + inject + screenshot per variant
│   └── browser.mjs            Playwright launch/context helper
├── stylewright.config.json    the swappable style-source definition
├── style-source/              vendored template + lib   (gitignored, from `init`)
│   ├── template.user.less
│   └── lib.less
└── work/                      per-site output           (gitignored)
    └── <site-slug>/
        ├── inspect.json       dumped CSS vars, selectors, theme attrs
        ├── baseline-*.png     un-themed screenshot
        ├── style.user.less    the style you author (deliverable)
        └── preview-*.png      themed screenshot per verify variant
```
