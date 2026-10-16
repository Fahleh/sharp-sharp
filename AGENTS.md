# Engineering Brief (AGENTS.md)

Rules and working process for Claude Code in this repository. Read it fully before writing code. The project is **Sharp Sharp**, a 3D Lagos delivery-rider game for start.ng (HNG task): stable, detailed and polished, not production grade. The game name lives in one constant (`GAME_NAME` in `js/config.js`); the start.ng address name is `sharp-sharp` unless the engineer changes it.

Feature scope and acceptance criteria are in `.context/SPEC.md`. Treat anything not in it as out of scope and ask.

## Project Docs

- `AGENTS.md` (repo root): this file. Read-only for Claude Code.
- `.context/SPEC.md`: the feature spec. Local, gitignored.
- `.context/StartNG-DOCS.md`: a copy of https://start.ng/docs.md. Platform source of truth. Local, gitignored, read-only. At the start of each pass, fetch the live page and tell the engineer if it differs.
- `README.md` (repo root): how to run, test and publish, and known limits. Keep it short and accurate. Update it in the same session as the change it describes.

Do not create other docs. Deviations from the spec go in the report.

## Reference code

The engineer's earlier game, Dusk Stack, is cloned read-only at `../dusk-stack` (ask if missing). It is the engineer's own code and may be reused: copy and adapt `startng.js`, `character.js` (style normalization and figure building), `sky.js`, `audio.js`, `storage.js` and UI patterns, then fix them for this game. Never import across repos, never edit the reference, never copy its docs or git history. Reused code still has to meet this file's standards and be tested here.

---

## Project Context

### Stack

- Plain JavaScript ES modules, HTML and CSS. No framework, no bundler, no build step, no TypeScript.
- three.js, **vendored** into `vendor/` as readable (non-minified) files. Never from a CDN.
- WebAudio only. No audio files, no speech synthesis.
- No physics library, no pathfinding library: movement is a kinematic model, collisions are 2D shapes on the ground plane, routing is A* on a small hand-authored road graph.
- start.ng provides players, character, leaderboard and hosting.
- Node is dev tooling only (`node --test`). No runtime dependencies, no `node_modules` in the repo.

The published game runs from static files exactly as committed. start.ng never builds anything.

---

## Mode of Operation

### This task is pre-approved

Do not wait for a proposal. The spec is approved. Instead, at the start of each pass:

1. Read this file, the spec and the docs.
2. Send a short **Findings** note: current state of the repo, doc drift, name availability (`GET https://api.start.ng/games`), and anything in the spec you think is wrong or too big.
3. Continue without waiting, unless the problem would change the scope. Then stop and ask.

### Scope control

The spec ranks features **Must, Should, Could**. Build all Musts and verify them before any Should. Build Coulds only if everything else passes and the engineer has not said to stop. If you are running out of room or time, cut from the bottom and say what you cut. A finished, tested smaller game beats a larger broken one.

### Raise disagreements

When the spec or a doc conflicts with a better approach: do not silently follow it, do not silently replace it. State it in the report. If it blocks the work, stop and ask.

### Verify third-party behavior

Before using three.js, WebAudio, `postMessage` or any start.ng behavior: read the vendored source or `.context/StartNG-DOCS.md` for the exact API. If real behavior differs from the docs, say so; do not work around it. Never write an API name, option or message type from memory. Separate confirmed behavior from inference.

### Verify claims before stating them

Do not claim a file's contents, a command's result, a passing check, a frame rate or an observed browser behavior unless you observed it in this session. If you could not run or view something (real phones, live sign-in, audio by ear), say exactly that.

### Actions that always require the engineer's approval

Stop and ask before any of the following:

- Adding any dependency to the repo, or any external script, font, image or CDN. (Tooling outside the repo, such as Playwright, is allowed and never committed.)
- Any network call other than `start.ng`, `api.start.ng`, and fetching docs or packages while setting up.
- Deleting files, deleting branches, or any destructive shell command.
- Pushing, opening a PR, or any history rewrite.
- Calling `POST https://api.start.ng/games/publish`. (`POST /games/check` is allowed once a repo URL and branch exist.)
- Changing `startng.json` stat keys after the first publish.
- Editing `AGENTS.md`.

### Pre-approved by this brief

- **Repo bootstrap (the one exception to "never commit to main")**: `git init -b main`, then one scaffold commit on `main` containing `.gitignore` (including `.context/`), `AGENTS.md`, `package.json` (scripts only) and a stub `README.md`. A shared root on `main` is required so later branches can open PRs. Nothing else is ever committed to `main`.
- Creating and using local branches named `feat/<short-kebab-description>` or `fix/<short-kebab-description>`, one per pass.
- Local commits, one per stage, when that stage's checks pass. Stage exact paths; never `git add -A` or `git add .` blindly. Conventional Commits, imperative summary of at most 72 characters. No co-author or AI-attribution trailers.

Commit and push remain separate. Push is never pre-approved. Claude Code never opens or merges a PR.

### Fix root causes

Address the cause, not the symptom. Do not add a guard to hide a bug you have not understood.

---

## Development Workflow

### Setup

Serve the repo root over HTTP (`python3 -m http.server 8080`). ES modules and the importmap do not work from `file://`.

### The task loop

1. Read the docs. Send Findings.
2. Build in the spec's stages. At each stage end: run `npm test`, load the game in the browser harness, fix what breaks, then commit the stage.
3. At the end of the pass, run the full verification (see Testing).
4. Update `README.md`.
5. Report. Stop. The engineer starts the next pass.

### Definition of done (per pass)

- Behavior matches the spec for the features in that pass's scope.
- `npm test` passes. State the exact commands and outcome.
- Browser checks ran at one desktop and one mobile size, with screenshots you actually looked at.
- Zero console errors and warnings across a full shift.
- Measured performance against the spec's budget (see Performance). State the numbers and how you measured them.
- No dead code, debug logging, stray TODOs, mock code or unrelated changes in the diff.

### Reporting

At the end of each pass, report:

- What changed, by stage, in a few sentences.
- Verification: commands run, results, measured numbers, and anything not verified.
- What you cut or deferred, with reasons.
- A manual checklist for what you cannot exercise (real phones, live sign-in, real score saving, audio by ear).
- Deviations from the spec and open questions.
- Proposed edits to this file, written out in full. Never apply them.

Do not recap every step.

---

## Global Code Standards

### JavaScript

ES modules only. Named exports only; no default exports, no `export *` barrels. `const` by default. No globals on `window`. No `eval`, `new Function`, or string-built code. JSDoc on exported functions. Input object for 3 or more arguments.

### Structure

Small files with one job. **Simulation rules** (kinematics, collision tests, near-miss detection, order generation, tip decay, scoring, routing, NPC state decisions, seeded RNG) live in pure modules with no three.js or DOM imports, so Node can test them. Rendering code reads sim state and never decides rules. Aim for no file over about 400 lines.

### Comments and constants

Comments explain non-obvious **why**, one or two lines. No magic numbers or strings: tunables live in `js/config.js`, named and grouped. Dialogue lives only in `js/lines.js`.

### Simulation and rendering

- Fixed timestep for the simulation (for example 1/60 s) with an accumulator, clamped so a long frame or a hidden tab cannot cause a spiral or a teleport. Render interpolates.
- Seeded RNG for anything random in the sim, so tests are reproducible. The default seed is random per shift.
- Cap `devicePixelRatio` at 2. Handle resize and orientation change.
- Pause the loop and suspend audio when the tab is hidden. Resume without catch-up. Also respect `pagehide` and `pageshow` with `persisted`: a bfcache restore must resume, not tear down.
- Instance or merge repeated geometry. Pool NPCs, bubbles and particles. Dispose what you remove. Remove listeners you add.
- Respect `prefers-reduced-motion` (less camera effect, no shake, fewer particles).

### start.ng integration

- Use the `askStartNg` helper from the docs, keeping the `e.origin` and `e.source` checks exactly.
- Never block gameplay on start.ng. The game starts with the guest look and swaps in the real character when the reply arrives, applied at the next shift start, not mid-shift.
- Treat every reply as untrusted. Validate shape and types.
- Save scores only as whole numbers from 0 to 1,000,000,000.
- Do not save a shift with zero deliveries.

### Storage

`localStorage` is allowed for exactly three things: mute, the banter on/off setting, and the personal best earnings. Wrap every read and write in try/catch. Parse defensively.

---

## Input Validation and Content Safety

Treat all external data as untrusted: `postMessage` replies, leaderboard entries, names, `style` values, face images, `localStorage`, query parameters.

- Character `style`: accept only documented values; colors must match `#rrggbb`; unknown or missing fields fall back to the guest default for that field.
- `face` is used as an image source only if it starts with `data:image/png;base64,`.
- Names and accounts, and **all dialogue**, are rendered with `textContent`. Never `innerHTML` with external or dialogue data.
- Dialogue content rules (spec Appendix A): mild, PG, no profanity, no slurs, nothing about tribe, religion, gender, disability or real people, and no real brand or company names. The engineer reviews `js/lines.js` before publishing. Do not add lines outside the reviewed categories.
- The game never shows real brand logos or real shop names. Use invented names.

---

## Performance Budget

Targets on a mid-range phone, from the spec: about 60 fps; at most 150 draw calls; at most about 200k triangles in view; at most 16 live vehicles, 24 live pedestrians, 4 live speech bubbles and 600 rain particles. Measure draw calls and triangles from the renderer's info, frame time in the browser, and heap growth across a full shift and across 10 restarts. Report numbers. If a budget cannot be met, say so and propose a cut.

---

## UX Baseline

Mobile-first and touch-friendly. Desktop: arrows or WASD to steer and accelerate, Space to brake, H to honk, P or Escape to pause. Mobile: on-screen controls placed for thumbs, large hit areas, safe-area insets respected, no scrolling, zoom or pull-to-refresh interference (`touch-action`, `overscroll-behavior`). Light accessibility baseline: labelled buttons, visible focus, readable contrast over every sky and rain state, `aria-live` for order and earnings changes, reduced-motion support, and a Banter off switch.

`data-state` on `<body>` (`loading`, `ready`, `playing`, `paused`, `gameover`) is part of the design. It drives styling and lets browser tests read the game state.

---

## Testing

Proportionate, aimed at behavior that could break a shift or start.ng integration.

**Node (`node --test`, in `tests/`)**: pure logic.

- Kinematics: acceleration, braking, steering limits, grip reduction in rain.
- Collision: circle and box tests, edge touching, bike vs static box.
- Near-miss detection: thresholds, speed gating, per-NPC cooldown.
- Route graph and A*: shortest path, unreachable, start equals goal; every authored node reachable from every other.
- Orders: generation is valid and seeded, payout and time budget from distance, tip decay curve, late handling, fragile condition, streak multiplier cap.
- Dialogue picker: never picks outside the category, respects cooldowns and the bubble cap.
- Style normalization and score payload (whole numbers, correct keys, range, no save at zero deliveries).

**Browser (Playwright, installed outside the repo, not committed)**: reported, not committed.

- Load, zero console errors and warnings.
- Run a full shift with real keyboard input and touch input at 390x844: pickup, delivery, earnings change, game over, restart.
- No-player path and a fake signed-in path (intercept `https://start.ng/connect` in the harness only). **Mock code never ships in the repo.**
- `?guest`, hidden tab, bfcache restore, resize and orientation change, rapid input.
- Screenshots at desktop and mobile sizes. Look at them.
- Performance numbers as above.

No `.only` or `.skip` left in tests. Never weaken an assertion. A failing test is a finding: reproduce, find the cause, fix.

---

## High-Signal Forbidden Patterns

```js
import * as THREE from "https://cdn.jsdelivr.net/..."; // vendored only
```

```js
bubble.innerHTML = line.text; // dialogue is textContent only
```

```js
console.log("debug", state); // no debug logging in committed code
```

```js
const grip = 0.7; // magic numbers belong in config.js
```

```js
img.src = reply.user.face; // validate the data:image/png prefix first
```

```js
window.game = game; // no globals; no test hooks that ship
```

Also never: a password field, a redirect on load, obfuscated or `eval`-style code, a secret, absolute asset paths (`/js/main.js`), a physics or routing library, real brand names or logos, `localStorage` for anything but the three allowed values, mock start.ng code in the repo, or a commit to `main` after the scaffold commit.

---

## Final Reminder

NEVER push, publish or edit this file without explicit approval. Local stage commits on a feature branch are pre-approved.

Build Musts first. Measure, do not guess. When in doubt, ask. Never claim something works unless you ran it.