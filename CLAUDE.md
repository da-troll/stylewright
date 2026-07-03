# stylewright — operating manual for the agent

You are running **inside this repo as a single Claude Code instance** that owns the
entire userstyle-creation loop: inspect a live site, write the style, compile it,
inject it into the real browser, look at the result, and iterate until it's right.
No handoff to Stylus or a second tool during the loop — Stylus is only the final
install target for the file you produce.

## The one-time setup (per machine)

```bash
npm install
npx playwright install chromium     # or rely on the system Chrome channel
node bin/stylewright.mjs init       # vendors the template + palette lib locally
```

`init` reads `stylewright.config.json` and writes `style-source/` (the upstream
template with its remote `@import` rewritten to the vendored lib). Re-run it if the
upstream style repo changes.

## The loop (per site)

Target site: the URL the user gives you. Work happens under `work/<site-slug>/`.

1. **Inspect the live site.**
   ```bash
   node bin/stylewright.mjs inspect <url> --scheme dark
   ```
   Read `work/<site>/inspect.json`. The gold is:
   - `rootVars` / `bodyVars` / `declaredVars` — the site's OWN CSS custom
     properties. If these exist, **remapping them is the whole job** (override ~15
     vars, re-skin the entire app). Always check here first.
   - `themeAttrs` — tells you how the site switches light/dark (a `data-theme`
     attr, an html class, or nothing → use `prefers-color-scheme`).
   - `topClasses` — real selectors to target when there are no theme vars.
   - View `baseline-*.png` to see the un-themed starting point.

2. **Write the style.** Scaffold from the vendored template:
   ```bash
   node bin/stylewright.mjs new <url>
   ```
   This fills the domain + metadata placeholders and seeds visible starter rules
   (so your first preview proves the pipeline). Then edit the file:
   - Replace the starter rules with the site's real selectors.
   - Pick ONE light/dark strategy and delete the other (see template comments):
     `prefers-color-scheme` if the site has no toggle, or target its theme
     attribute (e.g. `:root[data-theme="dark"]`) if it does.
   - Inside `#catppuccin(@flavor)` write the actual CSS. **Map by semantic role,
     not by eye** — use `palette.roleHints` in the config as your guide
     (page background → `@base`/`@mantle`/`@crust`; raised surfaces → `@surface*`;
     body text → `@text`, secondary → `@subtext*`; interactive → `@accent`).
   - The fast path: override the site's own vars.
     ```less
     :root {
       --site-bg: @base;
       --site-text: @text;
       --site-accent: @accent;
     }
     ```

3. **Preview + screenshot (the sighted step).**
   ```bash
   node bin/stylewright.mjs preview <url> work/<site>/style.user.less
   ```
   This compiles each verify variant (default: `mocha-dark` + `latte-light`),
   injects the compiled CSS into the live page, and writes
   `work/<site>/preview-<variant>.png`.

4. **Look at the screenshots. Critique your own work.** Read each
   `preview-*.png`. Check specifically:
   - Unreadable text (contrast), missed regions (sidebar/header/footer still
     un-themed), elements that kept their original color (a selector lost a
     specificity war — strengthen it, don't reach for `!important` first).
   - Both flavors look right (don't hardcode a color that breaks the other).

5. **Drive hidden UI.** Menus, modals, dropdowns, dialogs only exist after
   interaction. Re-run `inspect`/`preview` after navigating, or extend the flow,
   to catch the 70% of the UI that isn't on the first paint.

6. **Iterate** steps 2–5 until clean (config `iteration.maxRounds` is the budget).

7. **Deliver.** The finished file is `work/<site>/style.user.less`. It is a valid
   Stylus UserCSS file (keeps the `@var` flavor/accent picker). The user installs
   it in Stylus once. Optionally also emit a flat CSS build:
   ```bash
   node bin/stylewright.mjs compile work/<site>/style.user.less --var darkFlavor=mocha --out work/<site>/style.mocha.css
   ```

## Key facts / gotchas

- **Chromium ignores `@-moz-document`.** `preview` strips that wrapper before
  injecting (otherwise nothing applies). The wrapper stays in the delivered file
  for Stylus.
- **`lib.less` is vendored** and the template's `@import` is rewritten to it, so
  compiles are offline-stable. Don't re-point the import at the URL.
- **Logged-in sites:** pass `--storage <file>` with a Playwright `storageState`
  JSON (export your session once) so inspect/preview see authenticated views.
- **Selectors > `!important`.** Prefer winning specificity legitimately; reserve
  `!important` for cases where the site itself uses it.

## Swapping the style source

Everything Catppuccin-specific lives in `stylewright.config.json → styleSource`.
To target a different style repo, edit that block (template URL, lib URL, the
import rewrite, the `variants` vars, and the `palette` names/roleHints), then
re-run `init`. The harness code never hardcodes Catppuccin. See README.md.
