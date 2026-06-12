# Design System: Vonia Voice Studio

## 1. Visual Theme & Atmosphere

Vonia is a recording studio rendered in software. Its interface lives in deep navy near-black (`#070b16`) — the controlled darkness of a mixing room where the only thing that should glow is the signal. Against this dark stage, a single electric cyan (`#22d3ee`) plays the role of the live indicator: it marks what is interactive, what is generating, what is alive. The design philosophy is reductive but warm — chrome retreats so that waveforms, voice names and generated audio become the protagonists.

The typeface is **Be Vietnam Pro**, chosen deliberately: it is a contemporary geometric sans engineered with native Vietnamese diacritics, so stacked tone marks (ầ, ữ, ỡ) render cleanly at every weight from 300 to 800. This matters because Vonia is a Vietnamese-first voice platform that scales to 14+ languages. Headlines run heavy (800) with tight negative tracking (-0.03em) for a confident, machined feel; body settles at weight 400 with comfortable 1.5–1.65 line-height. **JetBrains Mono** handles every technical surface — voice IDs, API tokens, timestamps, code blocks — its slashed zero and clear punctuation reinforcing the developer-grade nature of the product.

Color is overwhelmingly navy. Surfaces step through five near-black tones (`#070b16` → `#18233b`) to create elevation without borders or heavy shadow. The cyan accent is rationed — it never fills large areas as a flat color. Instead, the signature **cyan→blue gradient** (`linear-gradient(100deg, #22d3ee, #3b82f6)`) is reserved for the brand mark, primary CTAs, slider fills, the audio player and active states. The result is an interface that feels like professional audio software: dark, focused, and lit by a single accent.

**Key Characteristics:**

- Deep-navy dark theme as the default; a clean light theme is available as a first-class alternative
- Single chromatic accent — cyan `#22d3ee` — reserved exclusively for interactive and live states
- Signature cyan→blue gradient for brand mark, primary actions, sliders and the audio player
- Be Vietnam Pro for UI (native diacritics, weights 300–800); JetBrains Mono for all technical text
- Elevation through five navy surface tones plus soft 1px luminous borders — almost never heavy shadows
- Waveform-as-hero: generated audio, voice avatars and live waveforms are the visual subject
- Tight headline tracking (-0.02 to -0.035em) with heavy 800 weights for billboard impact
- Granular 4px-based spacing; radii from 6px up to a 999px pill

## 2. Color Palette & Roles

### Brand & Accent

- **Cyan** (`#22d3ee`): `--accent`. The single chromatic color — links, focus rings, active nav, live indicators, selected rows.
- **Teal** (`#38e0d4`): `--accent-2`. Secondary highlight, gradient companion.
- **Cyan Strong** (`#06b6d4`): `--accent-strong`. Accent shadow color, hover emphasis.
- **Cyan Deep** (`#0e7490`): `--accent-deep`. Pressed states, deepest accent tone.
- **Gradient** (`linear-gradient(100deg, #22d3ee 0%, #3b82f6 100%)`): `--grad`. Brand mark, primary CTAs, slider fill, player, plan pills.
- **Accent Ink** (`#04141a`): `--accent-ink`. Text/icon color placed on top of accent or gradient surfaces.

### Navy Surfaces (Dark Theme)

- **Base** (`#070b16`): `--bg`. Deepest app background, behind everything.
- **Surface** (`#0e1525`): `--surface`. Cards, panels, sidebar, modals.
- **Surface 2** (`#131c30`): `--surface-2`. Hover fills, active tabs.
- **Surface 3** (`#18233b`): `--surface-3`. Inline chips, scrollbar thumb, avatar wells.
- **Elevated** (`#16203a`): `--elevated`. Popovers, dropdown menus, toasts.
- **Inset** (`#0a0f1d`): `--inset`. Inputs, textareas, code blocks — recessed below the surface.

### Text

- **Text** (`#eaf0fb`): `--text`. Primary copy on navy.
- **Text Soft** (`#b9c4da`): `--text-soft`. Secondary copy, labels.
- **Text Muted** (`#7e8aa6`): `--text-muted`. Descriptions, metadata.
- **Text Faint** (`#586484`): `--text-faint`. Placeholders, disabled, fine print.

### Borders

- **Border** (`rgba(148,173,214,0.12)`): `--border`. Default luminous hairline — a cool light tint, never pure white or black.
- **Border Strong** (`rgba(148,173,214,0.22)`): `--border-strong`. Hover borders, dropdown edges.
- **Border Faint** (`rgba(148,173,214,0.07)`): `--border-faint`. Internal dividers, table row separators.

### Semantic

- **Good** (`#34d399`): `--good`. Success, generation complete. Tint: `rgba(52,211,153,0.14)`.
- **Warn** (`#fbbf24`): `--warn`. Warning, queued, hardware notice. Tint: `rgba(251,191,36,0.13)`.
- **Bad** (`#f87171`): `--bad`. Error, destructive actions. Tint: `rgba(248,113,113,0.14)`.
- **Info** (`#60a5fa`): `--info`. Neutral informational accents.

### Light Theme Overrides

Vonia ships a complete light theme via `[data-theme="light"]`. Surfaces invert to `#eef1f7` base / `#ffffff` surface; text becomes `#131c2e`; the accent shifts to a slightly deeper cyan (`#0891b2`) for AA contrast on white, the gradient to `linear-gradient(100deg, #06b6d4, #2563eb)`, and `--accent-ink` flips to `#ffffff`. Borders become navy-tinted (`rgba(28,48,84,…)`) and shadows soften to navy rather than black.

## 3. Typography Rules

### Font Family

- **UI / Sans**: `'Be Vietnam Pro'`, fallback `system-ui, sans-serif`. Weights 300, 400, 500, 600, 700, 800 + italic 400.
- **Mono**: `'JetBrains Mono'`, fallback `ui-monospace, monospace`. Weights 400, 500, 600.
- Be Vietnam Pro is used for everything visual; JetBrains Mono for voice IDs, tokens, timestamps, table numerics and code.

### Hierarchy

| Role | Font | Size | Weight | Tracking | Notes |
|---|---|---|---|---|---|
| Display | Be Vietnam Pro | 42–68px | 800 | -0.035em | Marketing / hero headlines |
| H1 | Be Vietnam Pro | 32px | 800 | -0.03em | Page & tab titles |
| H2 | Be Vietnam Pro | 24px | 700 | -0.02em | Section headings |
| H3 | Be Vietnam Pro | 19px | 700 | -0.01em | Card / panel titles |
| Brand name | Be Vietnam Pro | 19px | 800 | -0.02em | "Vonia." with cyan dot |
| Stage title | Be Vietnam Pro | 15px | 700 | -0.01em | Workspace stage header |
| Body | Be Vietnam Pro | 15px | 400 | normal | Standard reading text |
| Body Emphasis | Be Vietnam Pro | 13.5px | 600 | normal | Buttons, field labels, voice names |
| Tab / Nav | Be Vietnam Pro | 13.5px | 500–600 | normal | Sidebar items, top tabs |
| Caption | Be Vietnam Pro | 12.5px | 400 | normal | Hints, descriptions, metadata |
| Micro / Label | Be Vietnam Pro | 10.5–11px | 700 | 0.10–0.13em | Section labels, ALL CAPS eyebrows |
| Mono | JetBrains Mono | 12–13px | 500 | normal | Voice IDs, tokens, timestamps, code |

### Principles

- **Vietnamese-first**: Be Vietnam Pro is selected for correct, beautiful stacked diacritics — never substitute a font that mangles tone marks.
- **Weight as hierarchy**: the scale leans on weight (400 body → 600 emphasis → 700/800 headings) rather than dramatic size jumps. Weight 800 is the signature heading weight.
- **Tight headlines, relaxed body**: negative tracking (-0.02 to -0.035em) compresses headings; body opens to 1.5–1.65 line-height for comfortable reading.
- **Uppercase micro-labels**: small section labels use 0.10–0.13em letter-spacing and uppercase to read as quiet system chrome, often in `--text-faint` or `--accent`.
- **Mono for truth**: anything a developer copies — IDs, tokens, payloads — is JetBrains Mono so it is unambiguous.

## 4. Component Stylings

### Buttons

**Primary**

- Background: `--grad` (cyan→blue); Text: `--accent-ink` (`#04141a`); Weight 700
- Padding: 10px 16px; Radius: `--r-md` (11px); no border
- Shadow: `0 8px 22px -8px var(--accent-strong)`; Hover: `brightness(1.06)`; Active: `translateY(1px)`
- Use: the single most important action per view ("Tạo giọng nói", "Nâng cấp Pro")

**Default / Ghost / Subtle**

- Default: `--surface` bg, 1px `--border`, `--text`; hover lifts border to `--border-strong`
- Ghost: transparent bg; Subtle: `--surface-2` bg, transparent border
- Small variant: 7px 11px padding, 12.5px text, `--r-sm` radius

**Danger**

- Text `--bad` on `--bad-soft` with `--bad-soft` border; hover fills solid `--bad` with white text.

### Inputs, Selects & Search

- Background: `--inset` (recessed); Border: 1px `--border`; Radius: `--r-sm` (8px)
- Focus: border → `--accent-line` plus `0 0 0 3px var(--accent-softer)` glow ring
- Placeholder: `--text-faint`; font 13.5px
- Custom select: trigger matches input; menu floats on `--elevated` with `--shadow-pop` and a `pop` scale-in animation; selected option uses `--accent-soft` + `--accent`
- Search: same inset field with a leading magnifier icon in `--text-faint`

### Sliders & Toggles

- Slider track: 5px `--surface-3`; fill: `--grad`; knob: 15px white circle with 3px `--accent` border, scales to 1.12 on hover
- Toggle: 38×22px pill, off = `--surface-3` with faint knob, on = solid `--accent` with white knob
- Segmented control: `--inset` track, active segment `--accent-soft` + `--accent` text

### Cards, Panels & Accordions

- Card: 1px `--border`, radius `--r-lg` (16px), `--surface` bg, no shadow by default
- Panel (collapsible): header is clickable with a cyan title (`--accent`, 12.5px, weight 700) and a rotating chevron; body reveals with 15px gap stack
- Elevation comes from surface contrast and luminous borders, not drop shadows

### Badges & Status

- Badge: 999px pill, semantic tint background + matching text (muted / accent / good / warn / bad)
- Status pill: 7px dot + label. `run` state pulses the cyan dot (`@keyframes pulse`); `done` uses good, `err` uses bad

### Audio Player & Waveform — the signature component

- Player bar: `--surface`/`--inset` on `--r-lg`; circular gradient play button (42px, `--grad`, accent-ink glyph) with accent-strong glow
- Waveform: a row of thin vertical bars; played/active bars are solid `--accent`, upcoming bars are `--accent-line`
- Scrub bar: 6px `--surface-3` track with `--grad` fill and a white knob ringed in cyan
- Timestamps render in JetBrains Mono `--text-muted`

### Voice Library

- Rows: avatar (deterministic color from name) + name + one-line VI/EN descriptor + star + play; selected row uses `--accent-soft` with `--accent-line` border
- Filter chips: 999px pills; active chip `--accent-soft` + `--accent`
- Star toggles to `--warn` (gold) when favorited

### Navigation

- Sidebar: fixed 176px wide, `--surface` tint with a subtle top light gradient; brand lockup at top, plan card + social row pinned to the footer
- Nav item: 11px radius, 13.5px text; active = `--accent-soft` bg, `--accent` text, `--accent-line` border; active badge inverts to solid accent
- Top bar: horizontal scrolling tabs (active tab = `--surface-2` + cyan text + soft shadow) and a tools cluster with theme/language segmented toggles

## 5. Layout Principles

### Spacing System

- Base rhythm: 4px. Common gaps: 4, 6, 8, 10, 14, 18, 22, 26px; larger steps 36, 48, 64, 92px for section breathing room.
- Dense at small sizes for precise typographic and icon alignment; generous between major regions.
- Flex/grid with `gap` is the default layout mechanism — never bare margins between siblings.

### App Shell & Grid

- Two-column app: `176px` sidebar + fluid main (`grid-template-columns: var(--sidebar-w) 1fr`).
- Main splits into a topbar (tabs + tools) and a content area; the workspace is a `348px` rail + fluid stage, collapsing to `300px` under 1080px and to a single column on mobile.
- Background uses a faint radial cyan glow at top-right over a vertical navy gradient — the only "decoration" in the system.
- Documentation / marketing pages center on a ~1080px max width.

### Border Radius Scale

- `--r-xs` 6px — chips, mini buttons
- `--r-sm` 8px — inputs, small buttons, selects
- `--r-md` 11px — buttons, nav items, panels (the default)
- `--r-lg` 16px — cards, results wrap, player
- `--r-xl` 22px — modals, large overlays
- `--r-pill` 999px — badges, segmented toggles, status pills
- Circle 50% — avatars, media controls, slider/scrub knobs

## 6. Depth & Elevation

| Level | Treatment | Use |
|---|---|---|
| Flat (0) | Surface color + 1px luminous border, no shadow | Cards, panels, most content |
| Raised (1) | `--shadow`: `0 8px 24px -8px rgba(0,0,0,0.55)` | Floating elements, tab active |
| Pop (2) | `--shadow-pop`: `0 18px 50px -12px rgba(0,0,0,0.75)` | Dropdowns, toasts, popovers |
| Overlay (3) | `--shadow-lg`: `0 24px 60px -16px rgba(0,0,0,0.7)` | Modals over a blurred scrim |
| Accent glow | `0 8px 22px -8px var(--accent-strong)` | Primary buttons, brand mark, play button |
| Focus | `0 0 0 3px var(--accent-softer)` + `--accent-line` border | Keyboard focus on all inputs |

**Shadow Philosophy**: On the dark theme, shadows are black and soft, used sparingly — depth is carried mostly by stepping between navy surface tones and by 1px borders tinted with cool light (`rgba(148,173,214,…)`). The one warm exception is the *accent glow*: gradient elements (brand mark, primary CTA, play button) cast a cyan-tinted shadow so they appear lit from within, like an LED on studio hardware. The modal scrim is `rgba(4,7,14,0.66)` with a 6px backdrop blur.

## 7. Do's and Don'ts

### Do

- Keep cyan (`#22d3ee`) exclusively for interactive and live states — it must read as "this is active".
- Reserve the cyan→blue gradient for the brand mark, primary CTAs, sliders and the audio player.
- Build elevation from the five navy surface tones and 1px luminous borders before reaching for shadow.
- Use Be Vietnam Pro for all UI and JetBrains Mono for every ID, token, timestamp and code block.
- Set headings heavy (700–800) with negative tracking; keep body at 400 with open line-height.
- Place `--accent-ink` (`#04141a`) on top of any gradient or solid-cyan surface for contrast.
- Treat the waveform, voice avatars and generated audio as the visual hero of any screen.
- Support both dark and light themes — light is a first-class mode, not an afterthought.

### Don't

- Don't introduce a second accent hue — the entire chromatic budget is cyan/blue.
- Don't fill large areas with flat cyan; gradient or tints only at scale.
- Don't use heavy or multiple stacked black shadows — depth comes from surface tone first.
- Don't put white or pure-black hairlines on navy — borders are the cool light tint `rgba(148,173,214,…)`.
- Don't substitute a font that breaks Vietnamese diacritics, and don't use weight 900.
- Don't place white text on the gradient — use `--accent-ink` for legibility.
- Don't add textures or rainbow gradients to backgrounds — only the single faint cyan radial glow.
- Don't round rectangles past 22px (999px is for pills and circles only).

## 8. Responsive Behavior

### Breakpoints

| Width | Key Changes |
|---|---|
| > 1080px | Full shell: 176px sidebar + 348px rail + stage |
| ≤ 1080px | Workspace rail narrows to 300px; voice library collapses to single column |
| ≤ 1100px | Webhook two-column tables stack vertically |
| Tablet | Sidebar may collapse; tabs scroll horizontally |
| Mobile | Single-column stage; dedicated mobile shell (`mobile.jsx` / iOS frame) |

### Touch Targets

- Media controls and play buttons: minimum 42–44px circular hit areas.
- Nav and tab items: ~40px tall with comfortable padding.
- Primary buttons: 10px 16px padding yields ~44px height.

### Collapsing Strategy

- Display headlines scale via `clamp()` (e.g. 42→68px) so impact survives down to mobile.
- Two-pane workspace folds into a stacked single column; the rail becomes a top sheet.
- Tab bars switch to horizontal scroll rather than wrapping or truncating.
- The navy background gradient and cyan glow persist at every size — the studio mood never breaks.

## 9. Agent Prompt Guide

### Quick Token Reference

- App background (dark): `#070b16` · Surface: `#0e1525` · Inset: `#0a0f1d`
- Primary action / brand: gradient `linear-gradient(100deg, #22d3ee, #3b82f6)`, text `#04141a`
- Accent (interactive): `#22d3ee` · Focus ring: `0 0 0 3px rgba(34,211,238,0.08)` + `rgba(34,211,238,0.35)` border
- Text: `#eaf0fb` primary, `#7e8aa6` muted on dark
- Border: `rgba(148,173,214,0.12)` · Semantic: good `#34d399`, warn `#fbbf24`, bad `#f87171`
- Radius default 11px; cards 16px; modals 22px; pills 999px · Fonts: Be Vietnam Pro + JetBrains Mono

### Example Component Prompts

- "Create a primary button: `linear-gradient(100deg,#22d3ee,#3b82f6)` background, text `#04141a` weight 700, padding 10px 16px, radius 11px, shadow `0 8px 22px -8px #06b6d4`. Hover brightens 6%; active translates down 1px."
- "Build an audio player on `#0a0f1d` inset, radius 16px: a 42px circular play button filled with the cyan→blue gradient and an accent-ink glyph, a waveform of thin bars where played bars are solid `#22d3ee` and upcoming bars are `rgba(34,211,238,0.35)`, and JetBrains Mono timestamps in `#7e8aa6`."
- "Design a voice-library row: 34px avatar with a deterministic color, name in 13.5px weight 600, a one-line VI/EN descriptor in `#7e8aa6`, a star that turns gold (`#fbbf24`) when favorited, and a play button. Selected state uses `rgba(34,211,238,0.14)` fill with a `rgba(34,211,238,0.35)` border."
- "Create the app sidebar: 176px wide, `#0e1525` tint, brand lockup at top (gradient glyph + 'Vonia.' with cyan dot + 'VOICE STUDIO' micro-label), nav items at 11px radius where the active item is `rgba(34,211,238,0.14)` fill with cyan text and a cyan-line border, and a gradient plan card pinned to the bottom."
- "Style an input: `#0a0f1d` recessed background, 1px `rgba(148,173,214,0.12)` border, 8px radius; on focus, border becomes `rgba(34,211,238,0.35)` with a 3px `rgba(34,211,238,0.08)` glow ring."

### Iteration Guide

1. Default to the dark navy theme; verify the design also reads in light mode.
2. Every interactive element gets cyan — nothing else does.
3. Primary actions and the brand mark get the gradient + cyan glow; secondary actions stay on navy surfaces.
4. Build elevation with surface tones and luminous borders before adding shadow.
5. Headings heavy (700–800) and tightly tracked; body 400 and open.
6. All technical text is JetBrains Mono; all Vietnamese text stays in Be Vietnam Pro.
7. Make the waveform/voice/audio the hero — chrome is quiet, the signal glows.
8. Respect the radius ladder: 11px default, 16px cards, 22px modals, 999px pills, 50% circles.

---

*Vonia Voice Studio Design System · v1.0 · last updated 08/06/2026 · tokens mirror `vonia/tokens.css`.*
