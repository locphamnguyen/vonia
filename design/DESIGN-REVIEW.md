# Vonia Voice Studio — Design + Engineering Review

_Reviewed 2026-06-07 · target: `design/project/vonia` prototype (as the plan) + live `web/src` · commit 2e291a7 / main_

> Excluded: `design/Brief-new.md` (specs a Snov.io sales CRM, unrelated to this product).

## Scope reviewed
Six voice screens + system settings, prototype (`design/project/vonia`, `design/project/screens`) and shipped React app (`web/src`). Backend is a separate Python FastAPI server (`omnivoice/server`), so UI-language work is frontend-only.

Classifier: APP UI (workspace, data-dense, task-focused).

## Decisions locked (user, 2026-06-07)
- **UI languages: ship VI/EN only now; other languages later.** Do the i18n architecture cleanup so adding languages later is cheap. The 7 currently-dead language buttons become "coming soon" (disabled), not dead code. RTL (Urdu) deferred with those languages.
- **Tests: build Vitest now** and cover core logic before the i18n refactor.
- **Offline state: add a global "backend not connected" banner now.**

## Ratings
Design overall: **8/10** (cohesive navy+cyan system in `tokens.css`, real typeface, working queue, warm empty states, passes AI-slop blacklist).
Engineering: architecture is sound (`useGenerator` is a real bounded-concurrency queue with cancellation + blob cleanup; `api.ts` maps sliders and guards NaN). Two structural gaps: i18n is half-bypassed, and there are zero tests.

| Pass / Section | Score | Headline |
|---|---|---|
| Design: Info Architecture | 8/10 | Clear 3-rail hierarchy; STT rail sparse |
| Design: States | 7/10 | Queue solid; empty states uneven; dead audio player |
| Design: Journey | 8/10 | Right arc |
| Design: AI Slop | 9/10 | Intentional, not generated |
| Design: Design System | 9/10 | Maps to tokens.css |
| Design: Responsive/A11y | 5/10 | Desktop-only; a11y unspecified |
| Eng: Architecture | — | A1 i18n half-bypassed (P1); A2 no offline state (P1) |
| Eng: Code Quality | — | C1 DRY (inline bilingual ternaries); C2 empty-state inconsistency |
| Eng: Tests | — | 0% coverage; Vitest + core logic (P1) |
| Eng: Performance | — | No frontend issue; blob memory acceptable |

## Verified findings (code-grounded)
- **[A1, 9/10] i18n half-bypassed.** Dozens of strings hardcoded as `lang==='en'?en:vi` (e.g. `TtsTab.tsx:174`, toasts 88/91/95, split options 154-156) bypass `t()`. `t()` falls back to Vietnamese silently (`i18n.ts:106`). Adding languages later is impossible until these are extracted.
- **[Dead buttons, 9/10] 7 of 9 language buttons do nothing.** `SettingsModal.tsx:68` guards `if (l.id==='vi'||l.id==='en') setLang(...)`; topbar (`App.tsx:59-60`) is VI/EN only. The other 7 are decorative. (Corrects the design-review framing "pick Chinese → Vietnamese": today clicking them does nothing.)
- **[A2, 8/10] No offline state.** `store.tsx` sets `apiOk` once on mount and it is never rendered (`grep apiOk` = store only). Backend down → every Generate errors per-row with no orientation. Banner needs polling or a shared connectivity state, not just rendering the static boolean.
- **[Tests, 9/10] Zero tests in web/.** Highest-risk untested surface: `useGenerator` cancel/concurrency/retry/`revokeAll`-on-unmount, `api.tts/stt` error mapping + `apiOk` failure path, `mapParams`, `splitText`. The parity guard must check non-empty values, not just key presence (MT/empty string would otherwise pass).
- **[C2, 9/10] Empty-state inconsistency.** Only `CloneTab.tsx:119-123` has the 3-step numbered guide; TTS/STT/Dialogue have prose only.
- **[C3, 6/10] SRT timing is a fixed 4s/line estimate** (`TtsTab.tsx:118`), not real audio duration → subtitles drift.
- **RETRACTED:** "duplicate table header" (design-review T3) does NOT exist in `web/src` — all tabs use `hasResults ? <ResultsTable> : <header-only+empty>`. It was a prototype-only artifact.

## NOT in scope (deferred)
- Translations for the 7 non-VI/EN languages + RTL Urdu layout — "other languages later" (user). Keep buttons as "coming soon".
- Audio history / generated-library screen (suggested in chat).
- Full mobile/tablet redesign — local desktop tool; declare desktop-only.

## What already exists (reuse)
- Design system `web/src/styles/tokens.css`; components `ui.tsx`, `results.tsx`, `voice-library.tsx`, `panels.tsx`, `SettingsModal.tsx`, `Onboarding.tsx`.
- `useGenerator` queue engine — reuse for all tabs (already shared).
- Clone's 3-step `.em-steps` empty state — reuse as the standard.
- `apiOk` in `store.tsx` — extend it for the offline banner.

## Implementation Tasks
Synthesized from this review. P1 blocks ship, P2 same branch, P3 follow-up.

- [ ] **T1 (P1, human: ~1.5 days / CC: ~2h)** — i18n — Extract all inline `lang==='en'?…:…` strings into the `t()` dictionary; keep VI/EN; mark the 7 other language buttons disabled + "coming soon"; add a VI/EN parity guard
  - Surfaced by: Eng A1 + dead-buttons finding
  - Files: `web/src/lib/i18n.ts`, `web/src/App.tsx`, `web/src/components/SettingsModal.tsx`, `web/src/tabs/*.tsx`, `web/src/components/panels.tsx`
  - Verify: switch VI↔EN, no hardcoded string survives; disabled buttons can't be selected; parity test passes
- [ ] **T2 (P1, human: ~1 day / CC: ~45min)** — tests — Add Vitest; cover useGenerator (cancel/concurrency/retry/revokeAll-on-unmount), api.tts/stt error mapping + apiOk path, mapParams (clamp/NaN), splitText (4 modes), i18n VI/EN parity+non-empty guard
  - Surfaced by: Eng Tests + outside voice (network/blob surface)
  - Files: `web/package.json`, `web/vitest.config.ts`, `web/src/**/*.test.ts`
  - Verify: `npm test` green; coverage on the 5 targets
- [ ] **T3 (P1, human: ~2h / CC: ~20min)** — connectivity — Wire `apiOk` (poll `/health` or funnel API failures into shared state) + render a global "backend not connected" banner
  - Surfaced by: Eng A2 + outside voice (apiOk is static)
  - Files: `web/src/app/store.tsx`, `web/src/App.tsx`
  - Verify: stop backend → banner shows; start → recovers
- [ ] **T4 (P2, human: ~2h / CC: ~15min)** — empty-states — Standardize the 3-step numbered empty state on TTS/STT/Dialogue (match Clone)
  - Files: `web/src/tabs/{TtsTab,SttTab,DialogueTab}.tsx`, `web/src/lib/i18n.ts`
- [ ] **T5 (P2, human: ~1h / CC: ~10min)** — player — Dim/disable AudioPlayer when no result loaded
  - Files: `web/src/components/ui.tsx` (AudioPlayer) / tab usage
- [ ] **T6 (P2, human: ~half day / CC: ~45min)** — a11y — aria-labels for icon-only buttons, keyboard nav, 44px touch targets, focus states
  - Files: `web/src/components/results.tsx`, `web/src/App.tsx`, `web/src/styles/tokens.css`
- [ ] **T7 (P3, human: ~2h / CC: ~20min)** — SRT — Use real audio durations for SRT export, or label timing as an estimate
  - Files: `web/src/tabs/TtsTab.tsx`
- [ ] **T8 (P3, human: ~1h / CC: ~15min)** — STT rail — Balance the sparse STT config rail
  - Files: `web/src/tabs/SttTab.tsx`
- [ ] **T9 (P3, human: ~30min / CC: ~10min)** — plan card — Wire the trial meter to real state or make it explicitly decorative (`App.tsx:40` hardcodes 70%)
  - Files: `web/src/App.tsx`
- [ ] **T10 (P3, human: ~30min / CC: ~10min)** — contrast — Ensure `--text-faint` (#586484, ~2.9:1) never carries essential body copy
  - Files: `web/src/styles/tokens.css`

## Failure modes
| Codepath | Realistic failure | Test? | Error handling? | User sees? |
|---|---|---|---|---|
| Generate when backend down | every row errors | T2 (planned) | per-row toast | **CRITICAL GAP today: no orientation → T3** |
| Stop mid-generation | in-flight row resurrects to done | T2 (planned) | handled (cancelled ref) | OK once tested |
| Stale localStorage settings | NaN → 422 | T2 (planned) | mapParams guards | OK |

1 critical gap (offline orientation) — fixed by T3.

## Parallelization
| Lane | Tasks | Modules | Notes |
|---|---|---|---|
| A | T2 | web/test, package.json | Independent, start now |
| B | T1, T4 | lib/i18n.ts, tabs/, SettingsModal | Sequential (shared i18n.ts) |
| C | T3 | app/store.tsx, App.tsx | — |
Conflict flag: T1 and T3 both touch `App.tsx` — coordinate or sequence. Launch A + (B or C) in parallel.

## Completion Summary
- Step 0: scope accepted (cut to VI/EN per user, smaller than original "9 languages")
- Architecture: 2 issues (A1, A2)
- Code Quality: 3 issues (C1, C2, C3) + 1 retraction
- Tests: diagram produced, 5 gaps (0% → planned coverage)
- Performance: 0 issues
- Outside voice: ran (Claude subagent) — 7 findings, 1 cross-model tension (resolved: cut to VI/EN)
- Failure modes: 1 critical gap (offline) → T3
- Parallelization: 3 lanes (A parallel; B/C coordinate on App.tsx)

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | issues_found | outside voice (Claude): 7 findings, scope tension resolved to VI/EN |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | issues_open | 7 issues, 1 critical gap (offline) |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | issues_open | score 8/10 → 10/10 after fixes, 1 decision |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **CROSS-MODEL:** Outside voice challenged the "translate 9 languages" decision; user cut scope to VI/EN (other languages later). Agreement strengthened the i18n-cleanup-first sequencing.
- **UNRESOLVED:** 0.
- **VERDICT:** Design + Eng review complete. 3 P1 tasks (i18n cleanup, Vitest core coverage, offline banner) before ship. Run /ship when P1s land.
