# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Node Market: an es-MX marketing site for a business that builds apps, websites, social-media management, and multimedia content for local Mexican businesses. Plain HTML/CSS/JS with ES modules — Vite is used only as a dev server and multi-page bundler; the shipped output is a static `dist/`. No UI framework, no CSS framework.

The site's core visual concept is a single, persistent Three.js "node network" canvas behind every page, which changes formation per route and reacts to scroll/cursor/hover — a literal expression of the brand name. All copy is Spanish (es-MX).

## Commands

- `npm run dev` — Vite dev server.
- `npm run build` — production build to `dist/`. This is the main way to catch templating/data errors (see below) — there's no separate typecheck step.
- `npm run preview` — serve the built `dist/` locally.

There is no lint or test tooling configured (no ESLint/Prettier config, no test runner). Verify changes with `npm run build` (catches templating/data/plugin errors) plus manual checks in a browser — most of what matters here (scroll-driven animation, the 3D scene, reduced-motion behavior, page-transition behavior) can't be confirmed by reading code alone.

## Architecture

### Build-time HTML pipeline

Each route is a plain `index.html` (`/`, `servicios/`, `paquetes/`, `portafolio/`, `nosotros/`, `preguntas-frecuentes/`, `contacto/`, plus root-level `404.html`), registered as its own entry in `vite.config.js`'s `rollupOptions.input`. Adding a page means adding both the folder+`index.html` and that entry.

`vite-plugins/html-data-partials.js` implements a small templating language in HTML comments, resolved entirely at build time:
- `<!--@include name-->` → inlines `src/partials/name.html`
- `<!--@each path as item-->...<!--@endeach-->` → loop, exposing `item` and `itemIndex`
- `<!--@if path-->...<!--@endif-->` → keeps the block only if `path` resolves truthy
- `{{ path }}` / `{{ path | filter:arg }}` → HTML-escaped data interpolation; filters (`mxn` currency, `enc` URI-encode) live in the same file
- `<!--@jsonld-->` → replaced with the `<script type="application/ld+json">` built by `professionalServiceJsonLd()`

This plugin must keep running with `transformIndexHtml: { order: 'pre' }` — partials inject `<link>`/`<script>` tags that Vite's own asset scanner needs to see, and that scan runs right after the `pre` phase. Any new HTML-transforming plugin has to respect the same ordering.

Data comes from `src/data/site.json` and `src/data/pricing.json` via `vite-plugins/site-data.js`'s `loadData()`, which also computes `site.marca.origin` from `marca.dominio` (empty until it's a real domain), validates each pricing stage's `estado` and derives `cupoTexto` from `cupoTotal`/`cupoDisponible`, and builds the JSON-LD payload while omitting placeholder fields.

`vite-plugins/seo-files.js` emits `robots.txt` and, only when `marca.origin` is non-empty, `sitemap.xml`; it also injects `<link rel=preload as=font>` for whichever self-hosted font files land in the bundle.

**Data rule, load-bearing for this project:** any field in `site.json`/`pricing.json` that isn't real yet (contact info, socials, domain, testimonials, portfolio content) is a string starting with `TODO:`. `isTodo()` in `site-data.js` is the single source of truth for "is this a placeholder," and it gates canonical URLs, OG tags, sitemap emission, and JSON-LD fields. Never invent plausible-looking values for these — leave them as `TODO:` and let the existing gating keep them out of the public output.

### Runtime: state bridge, page lifecycle, navigation

`src/state.js` is a minimal pub/sub (`state`, `on(event, handler)`, `emit(event, payload)`, `setState(patch)`) — the only channel connecting DOM-driven values (scroll progress, active section/group, pricing-stage data) to the Three.js scene. New cross-cutting signals should go through this module rather than a new ad hoc mechanism.

`src/js/main.js` is the top-level orchestrator, wired once per full page load (not per navigation):
- Creates Lenis and syncs it to `gsap.ticker` manually (`lenis.raf` driven by the ticker, not its own rAF loop) inside a `gsap.matchMedia()` block gated on `(prefers-reduced-motion: no-preference)`, so reduced-motion users get native scroll instead.
- Drives `state.scroll` from a scrubbed `ScrollTrigger` over the whole document.
- Owns the Swup instance (no-reload navigation over static pages) and its hooks: `animation:out:await` runs a GSAP exit animation, `content:replace` (before) tears down the outgoing page module, `page:view` initializes the incoming one and updates the route announcer, `content:scroll` (replace) routes scroll-restoration through Lenis instead of the browser default.
- Boots the 3D scene lazily (`import('../background/scene.js')`), deferred until after `window.load` plus `requestIdleCallback`, so it never competes with first paint. Once started, the scene persists across Swup navigations — it is not recreated per page.

Each page module (`src/js/pages/*.js`, auto-discovered via `import.meta.glob('./pages/*.js', { eager: true })` and matched to `<main data-page="...">`) is built with `definePage(setup)` from `src/js/dom/page.js`. That factory wraps `setupReveals()`, `setupNodeLine()`, and the page's own `setup(container)` in a single `gsap.matchMedia()` context; `destroy()` just calls `mm.revert()`, which undoes every ScrollTrigger/listener/SplitText instance created inside. A page's `setup` only needs to return a cleanup function for things revert can't already handle — e.g. `paquetes.js` reads pricing-stage `data-*` attributes into `state.stages`, `contacto.js` wires the WhatsApp form submit handler.

### The 3D background

`src/background/scene.js` owns the single renderer/scene/camera for the whole site and is the only place driving `gsap.ticker` for rendering.
- `scene.background` is set via `new Color(...)`, not `renderer.setClearColor()` — required for Bloom to composite correctly.
- Quality is one of three tiers (`src/background/quality.js`: high/medium/low, differing in node count/DPR cap/bloom on-off), picked from device heuristics (`hardwareConcurrency`/`deviceMemory`/viewport width) unless overridden with `?quality=`. A hysteresis-based FPS monitor drops a tier when average FPS stays under 42 for 3 consecutive 1s checks after a 3s warmup, and is disabled entirely when `?quality=` is forced.
- Bloom (`EffectComposer`/`RenderPass`/`UnrealBloomPass`/`OutputPass`) is dynamically imported and only ever constructed for the high tier.
- `src/background/NodeNetwork.js` is the point-cloud/line-segment system (custom GLSL shaders for glow/size/pulse). `setFormation(name, { stages })` blends to a new target layout from `src/background/formations.js` (`calma`, `ciudad`, `constelaciones`, `ruta`, `converge`); which one is active is driven by the `data-formation` attribute on each page's `<main>`, read in `main.js`'s `enterPage()` into `state.formation`. `ruta` shapes satellite nodes from `state.stages` (the pricing data) and is only meaningful on `/paquetes/`.
- Rendering pauses on tab-hidden and under `prefers-reduced-motion: reduce` (draws exactly one static frame instead).

### DOM animation layer

Three modules, all wired in automatically through `definePage`/`page.js`:
- `src/js/dom/reveals.js` — elements marked `data-reveal` (and direct children of `data-stagger`) fade/slide in via `ScrollTrigger.batch()` when scrolled into view; elements marked `data-split` get `SplitText` line-mask entrance animations. The hidden initial state (`opacity:0; transform:translateY(1.5rem)`) lives in `motion.css` under `.js [data-reveal]` etc., scoped to `(prefers-reduced-motion: no-preference)` — so content stays fully visible with no JS or with reduced motion. To make new content reveal on scroll, just add the matching `data-reveal`/`data-stagger`/`data-split` attribute in the HTML; no JS changes needed.
- `src/js/dom/nodeLine.js` — the straight SVG line down the page that lights a dot per section as it's scrolled past; positions are computed from section anchors on layout/resize.
- `src/js/dom/magnetic.js` — cursor-following pull on CTA buttons, gated to `(hover: hover) and (pointer: fine)` so it never activates on touch.

All three only ever run inside a `gsap.matchMedia()` context and are written so reverting that context fully undoes them — that's what keeps Swup navigation free of leaked ScrollTriggers/listeners across pages. New scroll/hover-driven DOM effects should follow the same pattern (register inside the page's matchMedia context, clean up via its revert or an explicit returned cleanup).

## Design tokens

`src/styles/tokens.css` is the single source for color, type-scale (`--step-*`) and spacing (`--space-*`, fluid via `clamp()`) — new CSS should build on these rather than hardcoded values. One deliberate, non-obvious choice: `--color-accent-solid` (`#465eff`) is a darkened variant of `--color-brand` (`#5d72ff`), used wherever white text sits on a solid fill (e.g. `.btn--accent`) because `#5d72ff` alone fails WCAG AA against white text (3.78:1) while `#465eff` passes (4.67:1). Use `--color-accent-solid` for that case, not `--color-brand`.

Fonts are self-hosted via `@fontsource-variable/*` / `@fontsource/playfair-display` (`src/styles/fonts.css`), latin subset only — not Google Fonts, not `latin-ext`.
