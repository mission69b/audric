# Handoff — Audric

Conversational finance on Sui. This bundle covers three deliverables:

1. **Marketing site** (`audric-marketing/index.html`) — public homepage, single scroll.
2. **App — light theme** (`audric-app-light/index.html`) — the signed-in product in light mode: 8 screens inside a persistent chrome (sidebar + main pane). **Primary theme.**
3. **App — dark theme** (`audric-app-dark/index.html`) — identical app, dark-mode variant. Same component tree and layout as the light app; only color tokens differ.

---

## About the design files

These files are **design references created in HTML** — prototypes showing the intended look and behavior. They are **not production code to copy wholesale**. Your task is to recreate them in the target codebase's existing environment (Next.js, Vite + React, etc.) using its established patterns, component libraries, and state management.

The HTML prototypes are runnable: open either `index.html` in a browser to see the finished design. Everything in this bundle is self-contained — fonts, icons, and the design-system CSS are all in `design_files/`.

If the target codebase doesn't yet exist, **Next.js 14 (App Router) + TypeScript + Tailwind** is a sensible default — but lift the design-token layer from `colors_and_type.css` into whatever token system your stack uses (CSS variables, Tailwind theme, Panda, etc.).

---

## Fidelity

**High-fidelity.** Colors, typography, spacing, radii, and interactions are final and approved. Recreate pixel-perfectly. The design system (tokens, type scale, color scale, button specs) in `colors_and_type.css` is the source of truth — do not invent new values.

---

## Folder layout

```
design_handoff_audric/
├── README.md                          ← you are here
└── design_files/
    ├── colors_and_type.css            ← design system (tokens, type, buttons, ADS base)
    ├── fonts/                         ← self-hosted fonts (Departure Mono, New York family)
    ├── icons/                         ← individual icon SVGs used by the app
    ├── icons-sheet.svg                ← full icon sprite sheet (reference only)
    ├── audric-marketing/
    │   └── index.html                 ← public marketing homepage
    ├── audric-app-light/              ← signed-in app, light theme (primary)
    │   ├── index.html                 ← entry; wires React + Babel and mounts <App/>
    │   ├── app.jsx                    ← shell + router (state-based, 8 routes)
    │   ├── sidebar.jsx                ← persistent nav + recent conversations
    │   ├── primitives.jsx             ← NavBtn, Tag, Icon, shared building blocks
    │   ├── dashboard.jsx              ← default chat landing
    │   ├── portfolio.jsx              ← holdings table + balance hero
    │   ├── activity.jsx               ← transaction feed + filter chips
    │   ├── pay.jsx                    ← payment link creator + QR
    │   ├── goals.jsx                  ← savings goals with progress
    │   ├── contacts.jsx               ← address book search
    │   ├── store.jsx                  ← creator store (coming soon)
    │   └── settings.jsx               ← account, session, wallet info
    └── audric-app-dark/                ← identical app, dark theme
        ├── index.html                 ← SAME layout as light; only :root tokens differ
        └── *.jsx                      ← component files identical to audric-app-light/
                                          except a handful of color-swap fixes (see Dark theme section)
```

---

## Dark theme

The light app is the primary reference — build against it first. The dark app (`audric-app-dark/`) is the exact same component tree with a retuned palette applied only at the token layer in `index.html`'s `:root` override block.

**Important:** the core design system (`colors_and_type.css`) has **no dark-mode tokens** — by design choice in the original Figma. The dark palette in `audric-app-dark/index.html` is hand-tuned and documented inline; treat it as the canonical dark spec until/unless the design system is extended with proper `[data-theme="dark"]` tokens.

### Dark palette — key values

| Token | Light | Dark | Notes |
|---|---|---|---|
| `--bg` (page canvas) | `#F7F7F7` | `#141414` | Near-black, not pure |
| `--panel` (card, sidebar) | `#FFFFFF` | `#1F1F1F` | Lifted grey, one step above page |
| `--panel-2` (input, user bubble) | `#F7F7F7` | `#0A0A0A` | Pure-ish black — inverts light-mode relationship |
| `--panel-3` (active nav, hover) | — | `#2A2A2A` | Dark-only; subtle lift for active/hover rows |
| `--line` (hairline) | `#E5E5E5` | `#2A2A2A` | |
| `--line-2` (strong border) | `#CCCCCC` | `#3D3D3D` | |
| `--text` (primary) | `#191919` | `#F5F5F5` | |
| `--text-2` (secondary) | `#707070` | `#B0B0B0` | |
| `--text-3` (muted) | `#8F8F8F` | `#808080` | |
| `--on-text` (fg on filled `--text` buttons) | `#FFFFFF` | `#0A0A0A` | NEW alias — light mode fills are black→white, dark mode fills are white→black |

### Accent colors on dark

The design system defines hue scales (`--b100`..`--b800`, etc.). Light mode uses the 500/600 step for solid accents. **On dark, promote one step up the scale** — use 400 — so the color reads as a vivid accent rather than a muddy mid-tone. This is standard dark-mode practice (Radix, Linear, GitHub).

| Accent | Light (`--xxx`) | Dark (`--xxx`) |
|---|---|---|
| Blue | `--b500 #0968F6` | `--b400 #3D91FF` |
| Green | `--g500 #3CC14E` | `--g400 #4CE160` |
| Red | `--r600` | `--r400` |
| Yellow | `--y600` | `--y400` |

### Status tag backgrounds on dark

The system's `--info-bg`, `--success-bg`, `--error-bg`, `--warning-bg` are pastel tints (`--b200`/`--g200` etc.) sized for white page surfaces. On `#1F1F1F` they wash out. The dark app overrides them with **14% alpha of the accent solid**:

```css
--info-bg:    rgba(61, 145, 255, 0.14);
--success-bg: rgba(76, 225, 96, 0.14);
--error-bg:   rgba(246, 106, 106, 0.14);
--warning-bg: rgba(229, 177, 0, 0.18);
```

Paired with the brightened 400-step accent as foreground, tags read as quiet tinted pills — the same role they play in light mode.

### Production recommendation

When porting: add a `[data-theme="dark"] { ... }` block to the real token stylesheet (in the target codebase's equivalent of `colors_and_type.css`) with the overrides above, rather than scoping them per-app. That way marketing, app, and any future surface inherit the same dark palette by flipping one attribute on `<html>`.

---

## Design system

Everything downstream pulls from `design_files/colors_and_type.css`. It defines:

### Colors
- **Neutral scale** `--n100` through `--n900` (9 steps, white → black via warm grays).
- **Hue scales** for Red (`--r100`..`--r800`), Orange (`--o100`..`--o800`), Yellow (`--y100`..`--y800`), Blue (`--b100`..`--b800`), Green (`--g100`..`--g800`), Teal, Purple, Pink — 8 steps each, all defined.
- **Semantic aliases** — use these by preference, not raw scale values:
  - Surfaces: `--surface-page`, `--surface-card`, `--surface-sunken`, `--surface-inverse`
  - Foreground: `--fg-primary`, `--fg-secondary`, `--fg-muted`, `--fg-disabled`, `--fg-on-inverse`
  - Borders: `--border-subtle`, `--border-strong`, `--border-interactive`
  - Status: `--success-solid`/`--success-bg`, `--error-solid`/`--error-bg`, `--info-solid`/`--info-bg`, `--warning-solid`/`--warning-bg`
  - Accent: `--accent-primary` (blue `--b500`)

### Typography (3 families, strict usage rule)
1. **New York** (serif, self-hosted in `fonts/`) — `--font-serif`. For hero numerals ≥32px and display headlines. Variants: Display (ExtraLarge optical), Large (body display), Medium (captions).
2. **Geist** (sans, loaded from Google Fonts) — `--font-sans`. For all UI body text, inline numerals in prose, buttons, form inputs.
3. **Departure Mono** (mono, self-hosted) — `--font-mono`. For UPPERCASE eyebrow labels (`AVAILABLE $79`), tabular data in aligned ledger columns, code (wallet addresses, tx hashes), button labels with `.1em` tracking.

### Numeral rule (strict — codify this in your component library)
| Context | Family | Example |
|---|---|---|
| Hero numerals ≥32px (one per screen) | `--font-serif` | `$111.53` balance on Dashboard |
| Tabular columns (ledgers, holdings, transactions) | `--font-mono` with `font-variant-numeric: tabular-nums` | Portfolio holdings table, Pay tool-card rows |
| Inline numerals in prose or small stats | `--font-sans` | "Earn 5.2% APY", body lines in chat bubbles |
| UPPERCASE label numerals (eyebrows) | `--font-mono` | `AVAILABLE $79 · EARNING $32` |
| Code (addresses, hashes, IDs) | `--font-mono` | `0x7f2059…d2f6dc`, `audric.ai/pay/ghsAk6h4` |

### Type scale
- Display: `--text-display-xl` (64px), `--text-display-lg` (48px), `--text-display-md` (32px), `--text-display-sm` (24px) — all New York with tight tracking
- Headings: `--text-h1` through `--text-h6` in Geist
- Body: `--text-body-lg` (16px), `--text-body-md` (14px), `--text-body-sm` (13px), `--text-body-xs` (12px)
- Label/mono: `--text-label-md` (12px), `--text-label-sm` (11px), `--text-label-xs` (10px), `--text-label-2xs` (9px) — all uppercase Departure Mono, letter-spacing `.06em` to `.14em`

### Spacing (4px grid)
`--space-1` (2) / `-2` (4) / `-3` (8) / `-4` (12) / `-5` (16) / `-6` (24) / `-7` (32) / `-8` (48) / `-9` (64). **Snap everything to this scale.** No 14px, 18px, 22px outliers.

### Radii
`--radius-sm` (4), `--radius-md` (8), `--radius-lg` (12), `--radius-pill` (999). Nothing else — no 3, 5, 6, 10, 14.

### Shadows
`--shadow-dropdown`, `--shadow-drawer`, `--shadow-modal`. The app is deliberately flat — shadows are reserved for floating UI only.

### Buttons (see `.ads-button-*` in the CSS)
- Sizes: sm (32px), md (40px), lg (48px). All pill-shaped.
- Styles: primary (black fill), secondary (bordered), tertiary (ghost), destructive (red fill).
- Label copy is **always mono, uppercase, `.1em` tracking**.

---

## Part 1 — Marketing site

**File:** `design_files/audric-marketing/index.html`

Single-page public site with a sticky nav and six content sections. Design is **editorial-minimalist** — large serif display type, mono eyebrow labels, neutral-only palette, bordered-grid cards instead of floating ones.

### Sections (in scroll order)
1. **Nav** — sticky top, 72px tall. Brand word-mark left, mono nav links center, `Sign in with Google` primary CTA right.
2. **Hero** — 2-column grid. Left: eyebrow "CONVERSATIONAL FINANCE", 76px serif h1 "Your money, handled.", lede, two CTAs. Right: interactive **chat widget** — 5 chip tabs (Balance / Send / Pay / Save / Swap), each swaps a pre-scripted 2-turn chat below a live dot + "ONLINE" status. Typing indicator animates at the bottom of each flow. Mock composer input + black send button.
3. **How it works** — 3 bordered cells in a row (01 / 02 / 03). Each: large serif numeral, title, body.
4. **Intelligence** — 5 bordered cells. Each has a colored SVG glyph (brand-illustrative fills like `#FFBD14` yellow star, `#F155A0` pink circle — these are intentional accents, not tokens), bold title, italic serif subtitle, body.
5. **Passport** — 4 bordered cells, same layout language as Intelligence but with monochrome glyphs.
6. **Pay** — Split layout. Left: chat artifact showing balance header + user question + tool-card response + rationale + token counter + 3 feature pills. Right: **sticky QR receipt card** with serif `$5.00` amount, rendered QR (all rect SVG), truncated `0x` recipient, pay/copy buttons, pulsing "Checking for payment…" indicator.
7. **Finance (alt)** — 4 bordered cells: Save / Credit / Swap / Charts. Monochrome SVG glyphs.
8. **Store** — 2-column split. Left: chat artifact showing a music-generation flow with multi-provider row receipts ("✓ Generated lo-fi track (2:34) · SUNO · $0.05") and a listing receipt. Right: pitch copy + "Permanent / Pay-to-unlock / 92% to you" stats.
9. **Product screenshot band** — browser chrome frame wrapping a mocked Audric app sidebar + dashboard. Uses the same tokens as the real app.
10. **Metrics** — 4 bordered cells: 55 Users / 93 On-chain tx / 540 Tool calls / 16.2M Tokens processed. Serif 38px values, mono labels.
11. **Footer** — 4 columns (brand+tagline+CTA / Product / Company / Resources) + legal strip.

### Typography pattern
- All display type: `var(--audric-display)` = New York Display (optical-size ExtraLarge) at weight 500, letter-spacing `-0.035em` at h1 / `-0.03em` at h2.
- Eyebrows: Departure Mono, 11px, uppercase, `.08em` – `.1em` tracking, `--n600`.
- Body: Geist sans, 14–17px, `--n700` for paragraphs, `--n900` for emphasis.
- All numerals follow the rule in the Design System section above.

### Responsive
At `max-width: 900px`: nav-links hide, hero collapses to single column, 5/4/3-up card grids collapse to single-column stacks with horizontal borders instead of vertical.

### Interactions
- **Hero chip row**: click a chip → `render()` replaces the widget body with that flow's scripted messages + a typing indicator. `balance` is the default. No backend — all canned strings.
- **QR pulse**: CSS `@keyframes pulse` — green dot with expanding halo, 1.8s loop.
- **Typing indicator**: 3 dots bouncing on stagger (0 / .15s / .3s), 1.2s loop.
- All links are `href="#"` / anchor jumps; only the chip row has behavior.

---

## Part 2 — App (signed-in product)

**File:** `design_files/audric-app-light/index.html`

React 18 + Babel in-browser (for prototype portability). In the real codebase: port to your build setup, strip the Babel loader, and swap inline `<script type="text/babel">` for proper imports.

### Global shell (`app.jsx`)
- `<Shell>` layout: 240px persistent `<Sidebar/>` on the left, `<main>` on the right.
- State-based routing: `useState('dashboard')` holds the current route; `setRoute(name)` swaps the main pane. Sidebar nav calls `setRoute`. 8 possible routes: `dashboard`, `portfolio`, `activity`, `pay`, `goals`, `contacts`, `store`, `settings`.
- Settings cog button absolute-positioned top-right (32×32, 4px radius, `--line-2` border). Hidden on the `settings` route itself.
- `--bg`, `--panel`, etc. in the `<style>` block are **aliases that reference system tokens** (`--surface-page`, `--surface-card`, ...). Keep this alias pattern if you want, or replace with direct token refs.

### Sidebar (`sidebar.jsx`)
- Brand "Audric" + BETA pill top.
- "+ NEW CONVERSATION" mono button (4px radius).
- 8 nav rows, each a `<NavBtn>` with left-aligned icon + uppercase mono label.
- Section divider "RECENTS" → list of 3 recent conversation previews with mono timestamps.
- Active row: `var(--line)` bg, `--text` fg. Hover: `--panel` bg. Inactive: transparent bg, `--text-2` fg.

### Screen-by-screen

#### Dashboard (`dashboard.jsx`)
- Purpose: landing chat surface after sign-in.
- Layout: centered 720px column.
- **Balance hero** — serif 56px `$111.53` centered, mono eyebrow below: `AVAILABLE $79 · EARNING $32`.
- **Composer** — 16px padding card with input, placeholder "Ask anything about your money…", 8px radius.
- **Quick action chips** — 6 mono pills below composer: Check balance / Send USDC / Generate pay link / Save idle / Swap / Health factor.
- **SaveDrawer** — collapsible panel triggered by `Save idle`. 8px radius, `--panel-2` bg, shows a key/value block (Route / APY / Deposit / Est. +$/yr) + two buttons (Deposit, Cancel).

#### Portfolio (`portfolio.jsx`)
- Purpose: view holdings.
- Top: balance hero + 24h change in green mono.
- Main: table. Columns: Token / Balance (mono tabular) / Price (mono tabular) / Value (mono tabular) / 24h (semantic green/red mono).
- Rows: USDC / SUI / WAL / NAVI. Token cell is icon + symbol + name stack.
- Footer: `121 TOKENS` mono eyebrow + "View all" ghost link.

#### Activity (`activity.jsx`)
- Purpose: transaction feed.
- Filter chips row: All / Sends / Receives / Swaps / Saves / Borrows. Active = black fill.
- Feed items: each has glyph (▲▼⇌⊕⊖), title, mono timestamp right, amount (green for receives, red for sends), tx hash `0x…` on a secondary line.

#### Pay (`pay.jsx`)
- Purpose: generate and share payment links.
- **Received strip** — green banner "RECEIVED $63.30" at top with mono timestamp.
- **Create link card** — input with "$" prefix, "Generate link" primary button. Output: generated link in a code chip + Copy / QR / Share buttons.
- **Recent links list** — 3 rows showing amount / recipient / status (Paid / Pending).

#### Goals (`goals.jsx`)
- Purpose: savings goals.
- 3 goal cards, each: flag emoji + title, `$have · pct% · rate` meta, thin progress bar (`--green` fill on `--line` track, 4px tall, 2px radius), "Auto-save $X/week" mono caption.

#### Contacts (`contacts.jsx`)
- Purpose: address book.
- Search input with leading search icon + `/` keystroke hint on the right.
- Contact list: avatar circle + name + sui handle + "Last sent" mono caption.

#### Store (`store.jsx`)
- Purpose: creator pay-to-unlock storefront.
- "Coming soon" state: large serif subtitle + waitlist CTA.

#### Settings (`settings.jsx`)
- Purpose: account surface.
- Sections: Account (email, avatar, plan), Session (wallet address in mono + COPY pill, network, session expiry), API (spend value in sans, key rotate button), Danger zone (Sign out everywhere — red button, 4px radius).

### Primitives (`primitives.jsx`)
- `<NavBtn>` — sidebar row; `active`/`hover` states, 4px radius, 8px/10px padding.
- `<Tag tone="green|red|blue|yellow|neutral">` — micro-pill badge. Uses semantic backgrounds (`--success-bg`, `--error-bg`, `--info-bg`, `--warning-bg`, `--line`) + matching solid foreground. 9px font, `.1em` tracking, 2px radius.
- `<Icon name=... size=... color=...>` — renders from `design_files/icons/` SVG set. Icons used: dashboard, settings, activity, pay (card), goals (flag), contacts (user), store, portfolio (chart-bar), plus, search, chevron-right, copy, check, alert, more-horiz. Fallback: Lucide equivalents are acceptable.

### Interactions & behavior
- **Route switching** is instant — no animation. If your codebase has a router (React Router, Next App Router), use it; state machine is fine for a prototype.
- **Composer submit** — Enter sends, scrolls feed if any. No backend — placeholder string echo is fine for prototypes.
- **Save drawer toggle** — opens on `Save idle` chip click, closes on Cancel or Deposit (both currently no-op).
- **Copy buttons** — should invoke `navigator.clipboard.writeText(...)` and flash "COPIED" mono label for ~1.2s.
- **Chip filters (Activity)** — click toggles active, filters the feed by category. Currently uses local state + `.filter()`.
- **Hover states** — on all interactive elements. Sidebar rows, buttons, chips, table rows. Duration 120ms, ease.

---

## State management

For a real app you'll need:

**User session**
- `session.user` — email, avatar, plan, zkLogin passport address
- `session.expiresAt` — timestamp

**Wallet / chain**
- `wallet.address` — Sui address (0x…)
- `wallet.network` — mainnet | testnet
- `wallet.balances[]` — per-token balance snapshots (token, amount, usdValue, priceChange24h)
- `wallet.totalUsd` — aggregated USD value

**Activity**
- `activity.transactions[]` — feed items (id, type, amount, counterparty, hash, timestamp)
- `activity.filter` — current filter chip

**Payment links**
- `payLinks[]` — generated links (id, amount, url, recipient, status, createdAt)

**Goals**
- `goals[]` — savings goals (id, title, target, have, autoSave, rate)

**Contacts**
- `contacts[]` — address book entries (id, name, handle, address, lastSent)

**UI local state**
- `route` — current screen
- `composerDraft` — current input text
- `saveDrawerOpen` — boolean

Most of this should come from your chain/agent backend; none of it is in the prototype.

---

## Assets

### Fonts (all in `design_files/fonts/`)
- `DepartureMono-Regular.otf` — Departure Mono 1.500 (MIT). Self-hosted.
- `NewYorkExtraLarge-Medium.otf`, `NewYorkExtraLarge-MediumItalic.otf`, `NewYorkExtraLarge-Semibold.otf` — New York Display. Self-hosted.
- `NewYorkLarge-Regular.otf`, `NewYorkLarge-Medium.otf` — New York Large.
- `NewYorkMedium-Regular.otf` — New York Medium (caption size).
- **Geist / Geist Mono** — loaded via Google Fonts `@import` inside `colors_and_type.css`. Self-host these in production via `@fontsource/geist` or similar.

### Icons
- `design_files/icons/*.svg` — 38 individual icon SVGs used by the app (dashboard, settings, activity, etc.). These are IBM Carbon icons re-exported from the Figma kit.
- `design_files/icons-sheet.svg` — the full Figma icon sprite sheet (4112 × 5387). Reference only; do not ship this.
- **Recommended approach:** use the Lucide React library in your codebase (`lucide-react`) — the individual icons map 1:1 and it's tree-shakeable. The handoff SVGs are there if you want exact-match fidelity.

### Brand illustrations (Marketing page)
Two intentional accent colors appear inline as SVG `fill` values and are **not part of the token system** — they're brand-illustrative:
- `#FFBD14` — yellow star on the Reasoning Engine card
- `#F155A0` — pink circle on the Silent Profile card

Keep these as literal hex in your icon components, not as tokens.

---

## Questions likely to come up

**Q: Can I use Tailwind?**
Yes. Map the CSS variables to your `tailwind.config` theme — `colors.surface.page: 'var(--surface-page)'`, `fontFamily.serif: ['"New York Display"', 'serif']`, etc. Keep the variable layer so design-system updates flow through automatically.

**Q: What about dark mode?**
Not in scope. The design is explicitly light-only ("audric-app-light"). If you need dark mode, the neutral scale inverts and `--surface-inverse` flips to `--n100` — but redo the semantic alias block before shipping dark.

**Q: Is the React setup prototype-grade?**
Yes. `index.html` loads React and Babel from unpkg and transpiles in-browser. For production: Vite or Next.js, proper imports, TypeScript, strip the `type="text/babel"` script tags.

**Q: Are there real backend integrations?**
No — all data is inline mock state. Every tool call, balance, and transaction in the prototype is a hardcoded string.

---

## Files to reference

If the developer wants to cross-check a component against the prototype:

| Feature | Reference file |
|---|---|
| Color tokens, type scale, button specs | `design_files/colors_and_type.css` |
| Marketing homepage | `design_files/audric-marketing/index.html` |
| App shell, routing | `design_files/audric-app-light/app.jsx` |
| Sidebar | `design_files/audric-app-light/sidebar.jsx` |
| Shared UI primitives (NavBtn, Tag, Icon) | `design_files/audric-app-light/primitives.jsx` |
| Dashboard / composer / quick actions | `design_files/audric-app-light/dashboard.jsx` |
| Portfolio table | `design_files/audric-app-light/portfolio.jsx` |
| Activity feed + filters | `design_files/audric-app-light/activity.jsx` |
| Pay link flow | `design_files/audric-app-light/pay.jsx` |
| Goals + progress bars | `design_files/audric-app-light/goals.jsx` |
| Contacts search | `design_files/audric-app-light/contacts.jsx` |
| Store (placeholder) | `design_files/audric-app-light/store.jsx` |
| Settings | `design_files/audric-app-light/settings.jsx` |

---

## Getting started

```bash
# Open the marketing site
open design_files/audric-marketing/index.html

# Open the app
open design_files/audric-app-light/index.html
```

Both run directly in the browser with no build step.
