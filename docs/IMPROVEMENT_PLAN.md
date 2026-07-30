# Harmonic.OS — Analysis & Improvement Plan

_Drafted 2026-07-29. Covers: current-state analysis, 2D UX, Quest VR UX, Apple Vision Pro strategy (WebXR + native), and rendering/content quality (formulas, shaders, lighting, materials)._

## Status (updated 2026-07-30)

**Done:** Phase 0 (git/GitHub + Pages deploy, clock-out-of-React, throttled geometry, real telemetry, bundle split, share URLs) · Phase 1 (favorites library + thumbnails, inline mathjs/GLSL validation, shortcuts, help overlay) · Phase 2 partial (shared light rigs + 16 physical material profiles + RoomEnvironment on the WebGL path; audio-reactive lights/materials; XR/desktop cosmos environment) · Phase 3 partial (uikit spatial console, two-hand gestures from AVP field tests, beat haptics, adaptive XR detail, favorites-only auto-pilot) · Phase 4a (verified on device: session, gaze+pinch UI, drag; fixes shipped for text + gestures) · Phase 5 major (31 curves given real math, 23 true (p,q) surfaces incl. supershapes, 98 authored shaders resurrected with QA, 6 audio-reactive shaders, per-preset art direction, validate script).

**Open:** Phase 2 renderer unification spike (WebGPURenderer + TSL everywhere — needs on-device validation) · Quest-specific tuning (snap turn, comfort vignette, perf pass — awaiting hardware) · Phase 4b native visionOS scaffold (optional, gated) · shader library dedup of the ~13 remaining template families · 2D axes/readout polish.

---

## 1. Current-state analysis

### What the app is
A Vite 6 + React 19 + TypeScript "math harmonics" visualizer (AI Studio scaffold) with:

- **Dual renderer paths** that share almost nothing:
  - **WebGL path** (`GraphView.tsx`, 2.5k lines): react-three-fiber Canvas + `@react-three/xr` v6. Formulas sampled via mathjs, 16 procedural geometry builders (tube/ribbon/…/vortex), GLSL `ShaderMaterial` presets (unlit), hand-rolled in-VR HUD built from boxes + `<Text>`, thumbstick locomotion, hand-height→scalar mapping.
  - **WebGPU path** (`WebGPUView.tsx`, 1.9k lines): raw `three/webgpu` WebGPURenderer + TSL node materials, its own OrbitControls, its own duplicated set of 16 geometry builders, 16 PBR material profiles, 10 lighting rigs, AgX tone mapping, and a separate hand-rolled WebXR session flow gated on `XRGPUBinding`.
- **App.tsx**: ~30 `useState` hooks, ~40 props drilled into `Controls`/`GraphView`; the animation clock is React state updated via rAF → **the entire React tree re-renders every frame**.
- **Libraries**: 248 formula presets (`constants.ts`) and 274 GLSL shader presets (`shaders.ts`), largely bulk-generated (three one-shot Python scripts at repo root plus in-file template generators). See §1.1 for what's actually inside.
- **Electron wrapper** (still named `react-example`, `com.example` appId, `nodeIntegration: true`).
- Audio beat sync (mic FFT → beat events → preset cycling with quantization), auto-cycle timers for formula/shader/lighting/geometry/material.

### Environment facts (verified on this machine)
| Item | Status |
|---|---|
| three / @react-three/fiber / xr / drei | 0.185.0 / 9.6.1 / 6.6.29 / 10.7.7 — **all current** (latest: 0.185.1 / 9.6.1 / 6.6.30) |
| Vite | 6.x installed; latest is 8.1.5 (upgrade optional) |
| TypeScript / build | `tsc --noEmit` clean; `vite build` succeeds |
| Bundle | **3.07 MB main chunk (854 KB gz)** + ~4.5 MB of XR-emulator room models in dist |
| Xcode | **26.6 installed, visionOS 26.5 SDK + Apple Vision Pro simulator present** — native visionOS effort needs zero new tooling |
| Unity / Godot / Blender | not installed (and not needed for the recommended path) |
| Dev HTTPS | mkcert cert valid to 2028, SANs incl. LAN IP `10.0.0.194` — headsets can reach `https://10.0.0.194:3000` |
| Git | **repo is not under version control** |

### 1.1 What's really in the formula & shader libraries (audited)

**Formulas — 248 total, mathjs expressions in `p`, `t`** (all 248 compile and evaluate finite — no broken math):
- 100 base presets (ids `1`–`100`), 100 generated "Organic root/PDE" variations (ids `101`–`200`), 8 hand-written organic, 40 "self-modifying" (parameter-evolving / coordinate / state-switching / mutation families using mathjs ternaries).
- **80 presets (ids 21–100) are second-class**: no `z`, no `geometryMode`, no `category` — they render as flat curves with hash-picked geometry. Ids 21–50 are 30 copies of one template whose expressive names ("Golden Spiral", "Chladni Plate", "Mandelbrot Edge") have nothing to do with their math — the generator scripts overwrote the expressions after naming them.
- 10 of the 16 `FormulaGeometryMode` values are never referenced by any preset.
- Typos: "Lorentz Attractor" should be Lorenz; "MACHOS" should be MACHO.

**Shaders — 274 total, but only ~17 genuinely distinct visual templates:**
- After normalizing numeric constants, the 274 fragment shaders collapse into 17 groups; 270 of 274 are constant-permutations of 13 templates. The largest group is 100 presets differing only in palette constants inferred *from the preset's name string*.
- **~2,130 lines of hand-written GLSL are dead code**: `enhanceShaderPreset` discards the authored `fragmentShader` for every preset without an `Organic PDE` category (i.e. all 100 base presets) and substitutes a template. Only `id`/`name`/`description` survive.
- **The WebGPU path ignores `fragmentShader` entirely** — it derives a TSL node material from a hash of the shader id. So: WebGL uses 174 of 274 authored programs; WebGPU uses zero.
- Misleading taxonomy: the "WebGPU TSL", "R185 TSL Lab", "Volumetric", "HTMLTexture", "XR lighting" categories (30 presets) are all plain WebGL1 GLSL — no TSL, no WGSL, no volumetrics, no XR light rigs anywhere in them.
- Mass-duplicated user-facing descriptions ("…replacing an older generated harmonic preset." × 100 — a leaked refactor note shown in the Sidebar).
- The three Python generator scripts are one-shot, already-applied, and now **destructive if re-run** (they splice before the last `];`, which has since moved). They should be archived, not reused.

### Key defects found (worth fixing regardless of any roadmap)
1. **Per-frame geometry allocation (WebGL/VR path).** `geometry3D` in `FormulaLine` is a `useMemo` keyed on `time` → a brand-new BufferGeometry is built and the old one disposed **every frame** in 3D mode. This is the single biggest performance problem, and it lands hardest on Quest. (WebGPU path throttles rebuilds to 140 ms — still CPU-side, but sane.)
2. **App-level clock in React state.** `setTime()` at 60 fps re-renders Sidebar/Controls/GraphView every frame. Time must move to a transient store/ref; React should re-render at UI rates (~10 Hz for the readout), not render rates.
3. **Feature asymmetry: VR gets the worst visuals.** The 16 material profiles, 10 lighting rigs, tone mapping — all WebGPU-only. Quest/AVP are forced onto the WebGL path (correctly, since `XRGPUBinding` is unsupported there), where shaders are unlit GLSL and lighting is one ambient + two point lights.
4. **Fake telemetry.** Footer latency is `Math.random()`, FPS "60.0" and "VERTS 1.2K" are hardcoded in two places, footer claims "Resolution: 200pts" while the sampler uses 500 points, and the p-range label says [0, 4π] while `GraphView` samples [0, 8π].
5. **Dead weight**: `@google/genai`, `express`, `dotenv` unused in src; duplicated geometry builders (~900 lines × 2); `basicSsl` imported but unused; Electron still `react-example` with `nodeIntegration: true, contextIsolation: false` (insecure defaults).
6. **No persistence/shareability**: no URL state, no localStorage, no favorites; a great configuration is lost on refresh.

---

## 2. Phase 0 — Foundation (prerequisite for everything else)

1. `git init`, commit baseline, add `.gitignore` entries for `release/`, `dev_server.log`, `.cert/`.
2. Rename app properly (package name, Electron appId, `<title>`, header). Harden Electron (contextIsolation on) or park the Electron target until it's needed.
3. Introduce **zustand** store (already in the R3F dependency graph): one store for settings (persisted to localStorage via middleware), one transient clock store subscribed outside React renders. Kills the 40-prop drilling and the per-frame tree render.
4. Extract shared modules: `src/lib/geometry/` (single copy of the 16 builders, parameterized by hash/time), `src/lib/formula.ts` (compile/sample/normalize), `src/lib/xr/` (session helpers).
5. Bundle hygiene: `manualChunks` for three/mathjs; keep XR emulator out of production builds; lazy-load the WebGPU view.
6. Real stats: wire actual FPS (rAF delta EMA) + real vertex counts; delete the fake numbers.
7. URL-hash state serialization (formula, shader, geometry, material, lighting, speed) → shareable links; "copy link" + "save PNG" buttons.

**Exit criteria:** clean git history, no dead deps, single geometry module, 60 fps desktop with React DevTools showing no per-frame commits, shareable URLs.

## 3. Phase 1 — 2D UX

The 2D mode is currently "3D mode with z ignored" plus a bare `THREE.Line`. Make it a first-class instrument:

- **Readability**: axes with ticks + numeric labels, optional polar grid, coordinate readout under cursor, auto-fit framing with animated rescale (the robust-extent normalizer already exists — expose it).
- **Line quality**: fat lines (`Line2`/`LineMaterial`) with adjustable width, optional additive glow trail (previous N phases ghosted), anti-aliased.
- **Parameter control**: expose p-range (currently hardcoded 8π), resolution slider (fix the 200/500 lie), per-formula default speed.
- **Editor**: CodeMirror 6 with math syntax highlight; live validation with inline error message (currently silent failure); chips documenting available variables (`p`, `t`, `s`); "fork preset" affordance instead of silently mutating id to `custom-…`. Same for GLSL editor + surfaced shader compile errors (currently console-only).
- **Library browsing**: page size 4 with ~25 pages is the worst part of current UX. Replace with virtualized scroll list + thumbnails (pre-rendered offscreen at low res, cached), favorites (star), recents, and "surprise me" honoring the active category filter.
- **Transport & shortcuts**: Space play/pause, ←/→ formula, ↑/↓ shader, F fullscreen, S screenshot; A/B loop markers on the scrubber; scrub without killing playback state permanently.
- **Layout & a11y**: collapsible side panels (maximize canvas), mobile layout that doesn't scroll the canvas off-screen, minimum 11px type for labels, focus rings, aria on all sliders/toggles (some exist already), reduced-motion mode (disable `animate-pulse` textareas — they pulse constantly today and read as broken).

## 4. Phase 2 — Renderer unification & visual quality

**Goal: one scene graph, one material system, VR gets the good visuals.**

- Adopt `WebGPURenderer` through react-three-fiber v9 (`Canvas gl={async (props) => { const r = new THREE.WebGPURenderer(props); await r.init(); return r; }}`) with **`forceWebGL` fallback** so the same TSL node materials compile to WGSL on desktop Chrome and GLSL on Quest/AVP. This dissolves the WebGL/WebGPU fork and deletes ~1.5k duplicated lines.
  - Spike first (1–2 days): verify `@react-three/xr` v6.6 + WebGPURenderer(WebGL backend) enters immersive-vr on Quest 3. If it fails, fallback plan: keep two canvases but move all materials/lighting to shared TSL modules that compile under both backends.
- **Materials**: port the 16 profiles to `MeshPhysicalNodeMaterial` and add physical features WebGL path never had: transmission (glass/ice), iridescence (pearl/hologram), sheen (velvet), anisotropy (carbon/liquid-metal), clearcoat (ceramic/chrome).
- **Lighting**: keep the 10 rigs but add an **environment map** per rig (PMREM from `RoomEnvironment` or small procedural HDRIs — no big assets), per-rig tone-mapping choice, optional soft shadows on desktop, and **BPM-synced light choreography** (key-light intensity pulse on beat — the beat detector already emits events).
- **Post-processing** (desktop first, quality-gated in XR): bloom via three/tsl PostProcessing, vignette, optional TAA/FXAA on the WebGL backend.
- **Geometry performance**: stop CPU rebuilds per tick — reuse preallocated buffers and update positions in place; instanced meshes for constellation/prism/lattice; long-term, move formula displacement into TSL `positionNode` so `t` animates on GPU with zero rebuilds (works for surface/ripple/mandala-class geometries; curve-topology ones keep throttled CPU rebuilds).

## 5. Phase 3 — Quest VR UX

- **Performance floor first** (fixes from Phases 0/2 are prerequisites): dynamic foveation (currently `foveation: 0` — maximum GPU cost), framebuffer scale 1.0 (currently `maxFramebufferScale` — supersampling on device), target 72/90 Hz. Verify with `adb` + OVR Metrics (see tooling section).
- **Replace the hand-rolled HUD with `@pmndrs/uikit`** (flexbox spatial UI, crisp text, proper hover/press). Structure:
  - a compact **wrist/hand quick-bar** (play/pause, next formula, next shader, HUD toggle),
  - a **world-anchored main panel** (current tabs: control/settings/view/pilot/formulas/shaders) with grabbable handle, billboarding option, and distance-adaptive scale,
  - legible typography (current HUD fonts are ~1 cm tall at 1.2 m).
- **Controller semantics** (today everything is point-and-click on tiny buttons):
  - A/X = next formula, B/Y = next shader, trigger = select, **grip = grab the visual** (one-hand move/rotate, two-hand pinch-scale),
  - left stick = locomotion (keep), right stick = snap turn (add; smooth-turn as option), click-stick = reset view,
  - **haptic pulse on beat** when audio sync is on (XRInputSource haptic actuators) — cheap, huge presence win.
- **Comfort**: snap turn default, optional vignette during smooth locomotion, floor grid during movement, "recenter" always one action away.
- **Hand tracking**: pinch = select, palm-up = summon quick-bar, two-hand pinch = scale/rotate; keep the hand-height→scalar as an explicit "Conduct mode" toggle with an on-HUD indicator (today it's invisible and mysterious).
- **Entry UX**: `offerSession` on Quest browser (one-tap Enter VR from the page), persist last session settings, auto-restore.

## 6. Phase 4 — Apple Vision Pro

**Recommendation: WebXR-first (days of work, reuses everything), with an optional native visionOS scaffold as a parallel exploratory track (tooling already installed).**

### 4a. WebXR in visionOS Safari (primary)
Vision Pro Safari supports `immersive-vr` WebXR; input is **transient-pointer** (gaze + pinch), no persistent controllers/gamepads. The current code already detects AVP and defaults to WebGL — the gaps are interaction-model gaps:

- Every adjustment bound to thumbsticks (locomotion, scale, distance, yaw) is unreachable on AVP → provide UI-button and pinch-drag equivalents for all of them (the uikit panel from Phase 3 mostly solves this).
- Verify all interactive elements work with transient-pointer events through @react-three/xr (they route as pointer events — the existing onClick handlers should work; needs on-device verification).
- Hand tracking: visionOS 2+ exposes WebXR hand joints; enable `handTracking` for AVP (currently force-disabled) behind a runtime capability check rather than UA sniffing.
- Session polish: `frameRate 'mid'` + framebuffer scale ≤1 (already done), test `immersive-ar` alpha-blend passthrough (AVP supports it in Safari 18+/26).
- **Deployment**: self-signed LAN certs are painful on AVP. Either install the mkcert root CA on the headset once, or (better) deploy to a public HTTPS host (Vercel/Netlify/GH Pages — static site, zero backend). A deployed URL also makes Quest testing one-click.
- Testing without hardware: the **visionOS 26.5 simulator on this Mac** runs Safari; WebXR support in the simulator is limited, so treat simulator as smoke-test only and validate on device.

### 4b. Native visionOS app (spawned effort, optional)
Everything required is already installed (Xcode 26.6, visionOS 26.5 SDK + simulator). Proposed scaffold milestones:

- **M1 (scaffold)**: SwiftUI app, volumetric window showing one formula as a RealityKit `MeshResource` tube regenerated on a timer; drag/rotate/scale gestures. Runs in simulator.
- **M2 (parity core)**: formula library (port expressions to Swift via `Expression`-style parser or embed JavaScriptCore + mathjs), geometry modes as Metal compute-generated meshes, material profiles as RealityKit ShaderGraph/PhysicallyBased materials.
- **M3 (immersive)**: full ImmersiveSpace, hands via ARKit, audio beat sync via AVAudioEngine, spatial audio.
- Decision gate after M1: continue only if WebXR-on-AVP proves insufficient (e.g., you want passthrough + persistent anchors + App Store distribution). A native app is a real second codebase — recommend spawning it as a separate repo/session.

**Not recommended**: Unity/PolySpatial or Godot for this project — new toolchain, license/build overhead, and the content is procedurally generated (no asset pipeline advantage). Revisit only if you want a single native codebase targeting both Quest and AVP stores.

## 7. Phase 5 — Content quality: formulas & shaders

Grounded in the audit in §1.1. The library's problem is not quantity (248 + 274) but honesty and variety: ~17 real shader looks and ~5 real formula families are presented as ~520 presets.

**Step 1 — Truth pass (do first, it's mostly deletion):**
- Reinstate or delete the 2,130 lines of dead hand-written GLSL: either stop `enhanceShaderPreset` from discarding authored shaders (many of the 100 originals — Mercury Glass etc. — are *better* than the template that replaced them), or reduce those 100 entries to a `{id, name, description}` table. Decide per preset; recovering the good originals is the single cheapest "more shader variety" win available.
- Collapse the 270 constant-permutations into their ~13 parent templates exposed as **parameterized styles** (template + sliders/randomize button) instead of hundreds of near-identical entries; keep a curated subset (~40–60 total) as named presets.
- Fix the second-class 80 formulas: give them real `z` expressions, `geometryMode`, `category` — or replace them outright with the new families below (their names are already good; write math that matches the names).
- Rename the fictional shader categories, dedupe descriptions, fix Lorenz/MACHO typos, unify id schemes, archive the Python scripts under `scripts/legacy/` with a warning README.
**Step 2 — New formula families** (each is a small, high-variety win in the existing `x(p,t), y(p,t), z(p,t)` model):
  - Supershapes (superformula) — huge visual range from 6 params,
  - Clifford / De Jong / Peter de Jong attractors (iterated — needs a sampler mode),
  - Lissajous knots & harmonograph (damped Lissajous),
  - Fourier epicycle series with animated coefficients,
  - Spherical-harmonics-modulated curves, Chladni-plate node lines,
  - Rose/maurer curves, cycloid families, phyllotaxis spirals.
- **True parametric surfaces**: add optional second parameter `q` → `x(p,q,t)` surfaces (Klein bottle, Boy's surface, seashell, torus family). The `surface` geometry mode currently fakes it from a 1-D curve; real (p,q) sampling is the single biggest content upgrade.

**Step 3 — Shaders**: port the ~15 best authored GLSL presets to TSL (so they light correctly, run on both backends, and finally reach the WebGPU path, which today ignores GLSL entirely); add curl-noise flow, thin-film iridescence, triplanar mapping, and a raymarched volumetric backdrop quad; make **audio-reactive uniforms** first-class (bass/mid/treble band energies as uniforms, not just beat events). Expose more than the single `time` uniform to preset shaders (resolution, beat phase, band energies, formula hash).
- **Per-preset art direction**: each formula preset can carry preferred geometry mode (exists), material, lighting rig, and speed — so "next formula" lands on a designed combination rather than a random hash pairing.

## 8. Sequencing & effort

| Phase | Scope | Rough effort |
|---|---|---|
| 0 Foundation | git, store, dedupe, bundle, stats, URL state | 2–4 days |
| 1 2D UX | axes/editor/library/shortcuts/a11y | 4–6 days |
| 2 Renderer unification | WebGPURenderer+TSL everywhere, materials/lighting/post | 5–8 days (spike first) |
| 3 Quest VR | uikit HUD, controller semantics, comfort, haptics, perf | 5–8 days |
| 4a AVP WebXR | input adaptation + deploy + device test | 2–4 days |
| 4b AVP native scaffold (optional) | M1 milestone | 3–5 days, then gate |
| 5 Content | curation + new families + TSL ports | ongoing, 1–2 days per family |

Recommended order: **0 → 2-spike → 1 → 2 → 3 → 4a → 5 continuously; 4b spawned in parallel after 4a validates**.

## 9. Tooling access needed (specific)

**Nothing blocking.** Everything for the recommended path is already on this machine (Node 26, Xcode 26.6 + visionOS SDK/simulator, mkcert cert in place). Specific nice-to-haves:

1. **Quest device testing**: enable Developer Mode on the Quest, then `brew install android-platform-tools` (adb) — lets me pull Quest Browser logs (`adb logcat`), capture OVR Metrics for real frame timing, and port-forward `adb reverse tcp:3000 tcp:3000` so the headset reaches the dev server as `https://localhost:3000` (cleaner than LAN IP certs).
2. **Public HTTPS deploy target** (Vercel/Netlify/GitHub Pages account) — removes all cert friction on both headsets; needed the moment you test AVP Safari seriously.
3. **AVP hardware on the same network** when Phase 4a lands — simulator can't validate gaze/pinch or real WebXR behavior.
4. Only if the native Quest store app ever becomes a goal: Unity + Meta XR SDK (not recommended now).
