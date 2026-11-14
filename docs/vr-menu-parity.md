# VR menus

## Automatic cast transitions (v2.22.0)

`Controls · Flight camera` adds **Flight auto cast** and **Flight cast transition** (Channel ripple / Ensemble dissolve). Casting requires Auto director; the style selector requires both toggles. Their native controls provide the same state, disabled behavior, and options to the spatial menu. Automatic casts use normalized meshes and the same note positions during crossfades, with two half-budget layers keeping combined XR work within the ordinary limits. Manual channel/shape/surface edits release automatic casting; camera/FX direction can continue. Both options persist in shared links (`pac`, `pct`). Validate with `validate:flight-auto-cast`, `validate:flight-actors`, `validate:state`, `validate:flight-effects`, `validate:menus`, and the mixed-flight regressions. Headset performance still needs hardware verification.

## Automatic performances and cat expression (v2.21.0)

`Controls · Flight camera` includes the saved **Flight auto director** toggle and current musical phrase/look/shot status. The same control starts score-driven six-second FX dissolves and smoothly eased camera styles on desktop and in VR. Manual camera/FX edits disable auto direction; model/channel/material edits keep it running with the chosen cast. XR transforms only the virtual stage, preserving headset tracking and user placement. The three new physical profiles and Petrol Nebula, Mermaid Lagoon, and Solar Forge showcases appear in the existing shared selectors/buttons. Both cat rendering paths use the same natural stance and expressive bone layer; model-stage Gesture strength retains its range and behavior. Validate with `validate:state`, `validate:flight-effects`, `validate:flight-auto-director`, `validate:cat-poses`, and `validate:menus`; hardware comfort/performance still needs device testing.

The spatial console opens on **All 2D menus**. Choose Application, Library,
Transport, or a Controls section. Each section has search and six-row pages;
select controls open paginated choices, numeric controls use the desktop step
and limits, and text fields open a spatial keyboard with cursor movement,
backspace, case, punctuation, newline, Apply, and Cancel.

The menus share the mounted desktop controls. This includes the mode switch,
formula and shader editors with validation, preset search/categories/favorites,
combos, lighting/material/geometry options and cycling, visual effects,
autopilot, audio source/library/transport, note effects, note visuals (formulas,
OBJ, GLB, prism canvas with its colour, slice and per-channel options), OBJ/GLB channel and
movement mappings, OBJ finish, gesture strength, backgrounds (including the mirror dome),
settings import/export, and the Letters page's Alphabet Sphere card (stereo view,
baseline, relief, collimation, point size, tour, depth rings, score picker) plus
its A–Z letter bar and aligned-letter status over the stage. Conditional
controls follow the same audio/silent/source rules as the desktop UI. A
collapsed desktop panel remains available to the spatial console.

Spatial View retains size, distance, yaw, geometry, auto-rotation, and reset.
Quick Music retains playback, piece navigation, and haptics. Session provides
playback/preset shortcuts and Exit Immersive. OBJ/GLB scenes now use the same
WebGL canvas and XR store as formulas, so source selection does not tear down
the immersive session.

## Browser operations

File pickers, photo preview, screenshots, and fullscreen are labeled
**(browser)**. These actions leave immersive mode before invoking the desktop
control. Re-enter VR after finishing the browser operation. System picker
presentation and permissions remain browser-dependent. Downloads and clipboard
access retain the desktop browser's behavior and permissions.

The experimental standalone WebGPU renderer does not host the shared spatial
console. Its VR entry offers a switch to WebGL, followed by the normal Enter VR
button. Desktop WebGPU rendering remains available. Selecting a different
renderer from an active spatial menu ends the XR session before replacing the
canvas.

## Maintenance and verification

`src/lib/spatialMenu.ts` adapts explicitly marked `data-spatial-menu` DOM roots;
it uses public DOM events and native value setters, not React internals. Mark
subsections with `data-spatial-section`, browser operations with
`data-spatial-browser`, and desktop-only panel/session chrome with
`data-spatial-skip`. Give controls accessible names and selected/disabled state.
Use `role="alert"`, `role="status"`, or `data-spatial-status` for messages that
must also appear in VR. Hidden mode-specific descendants are excluded; hidden
file inputs inside labels remain accessible.

The active menu polls at 4 Hz because window requestAnimationFrame can pause
inside immersive sessions. Polling stops when another console tab is opened.
Control identities remain stable; unchanged snapshots do not rerender.

Run `npm run validate:menus`, `npm run lint`, `npm run validate:models`, and
`npm run build`. The menu contract check is also part of the Pages build job.
`?hudpreview` displays the console in the desktop canvas for layout and pointer
checks, including after model switches. Actual headset testing is still needed
for controller/gaze ergonomics, system file pickers, and immersive renderer
transitions.

## Flight studio (v2.14.0)

`Controls · Prism canvas` mirrors the desktop Flight studio, including four look buttons, six trail shapes, three surface modes, the complete OBJ sculpture selector, Flight divergence (0–2 in 0.1 increments), Trail memory (0–120 seconds in 5-second increments, zero = whole score), spectrum slices and shared/per-channel canvases. Divergence is disabled in shared mode on both surfaces. The same DOM controls drive VR, so selected options, disabled states, numeric bounds, and preset actions match. Flights remain on the WebGL/XR canvas. New physical material profiles are available in the shared Output controls.

## Animated GLB flight channels (v2.15.0)

The seventh trail shape, Animated GLB, and the Animated flight preset are shared desktop/VR controls. `Controls · GLB flight channels` contains each active MIDI channel’s model, material (Auto, Original, all 20 physical profiles), and rig-specific movement selector, plus Reset flight channels. Model changes clear incompatible movements. Per-channel assignments override the global Output material and are saved in the URL’s `pch` field. The finish-family selector affects Auto channels. Prism color/slice controls are hidden for GLB models because the rigs use their selected physical/authored materials. The stage uses the existing WebGL/XR canvas, gestures, and independent plane paths, with a lower animated history cap in XR.

## Mixed flight channels (v2.16.0)

Mixed by channel is the eighth Trail shape; Mixed flight is the sixth look. In `Controls · Flight channels`, each active MIDI channel exposes Source (GLB, OBJ, built-in shape), a source-specific model/shape selector, its own Material, and a Movement selector only for GLB rigs. The shared DOM keeps desktop and VR options and selected values aligned. Original materials apply to imported GLB/OBJ models; built-ins expose Spectrum and the physical profiles. Prism color/slice settings apply to static trails in mixed mode. Existing asset-only GLB mappings remain valid, and mixed mappings add validated `kind` and `shape` fields to the same `pch` share setting. The shared stage remains on WebGL/XR, with the headset history pool reduced for performance.

## Camera choreography and independent stars (v2.20.0)

`Controls · Flight camera` adds Follow style (`Camera follow style`): Balanced, Chase, Orbit, Cinematic. `Camera musical energy` runs 0–2 in 0.05 steps and is disabled when follow is Off or style is Balanced. The same controls, values, and disabled conditions reach VR; XR styles reframe/rotate the virtual sculpture while leaving head tracking intact. `pcs` and `pce` store these settings independently of the follow flag and scene presets.

`Controls · Backdrop` exposes Cosmos backdrop and Starfield as independent toggles. `sf` saves stars, defaulting to Off without borrowing the legacy `env` value. Presets preserve both preferences. Dome/floor visibility now respects Cosmos backdrop in XR too; passthrough still hides virtual surroundings.

`Controls · Flight FX` adds Möbius Dream, Crystal Galaxy, Event Horizon, and Möbius silk (`Flight ribbons`), Holographic geodes (`Flight crystals`), Accretion vortices (`Flight vortexes`), all 0–2 in 0.05 steps. They share `pfx` with the existing layers and use lower geometry budgets in XR. Fresh audio landings use Mars/Cosmic Jelly/follow On, while saved choices and share links take precedence.

## Flight cinema (v2.19.0)

`Controls · Flight camera` exposes the native **Camera follow** checkbox with the same `prismCameraFollow` state used on desktop. It defaults to Off and persists in the validated `pcf` share flag; presets and Clear flight FX preserve this independent preference. Desktop follow controls aim/distance smoothly and yields to manual orbit/zoom. In XR it frames the virtual sculpture, leaving the tracked headset camera untouched. Headset hardware testing is still required.

`Controls · Flight FX` adds Electric Tempest, Prism Bloom, and Bubble Ballet plus Plasma lightning (`Flight lightning`), Prismatic flowers (`Flight petals`), and Thin-film bubbles (`Flight bubbles`). All three run 0–2 in 0.05 steps, are saved in `pfx`, and default to zero for old links. They combine with all previous layers. Lower XR density changes only geometry budgets, not controls, values, or behavior.

## Light sculptures (v2.18.0)

`Controls · Flight FX` also mirrors Aurora Dream, Quantum Garden, and Clockwork Nebula, plus Aurora silk (`Flight auroras`), Chord constellations (`Flight constellations`), and Orbital gyroscopes (`Flight gyroscopes`). All three dials run 0–2 in 0.05 steps. Motion field includes Corkscrew flight (`helix`) and Butterfly figure eight (`butterfly`) with the same existing strength dial. The shared native controls expose identical values, ranges, scene actions, and clear behavior in VR. The validated `pfx` field stores the new settings; previous links leave the new layers disabled. The sculpture overlays use lower density in XR while keeping the same effect and motion options. No camera motion is added.

## Flight FX laboratory (v2.17.0)

`Controls · Flight FX` mirrors four complete showcase buttons (Supernova, Neon Highway, Cosmic Jelly, Stargate), Clear flight FX, Starbursts/Shockwaves/Lasers/Tracers (0–2 in 0.05 steps), Liquid morph (0–1 in 0.01 steps), Motion field (Still, Satellite orbits, Vortex spin, Sine-wave surfing, Breathing pulse), and Motion strength (0–2 in 0.05 steps, disabled on Still). The same native controls drive VR. Showcase buttons apply a full visual scene; direct dials preserve the channel visuals, and Clear removes only effects. All settings live in the validated `pfx` share field. Older links default to no extra effects. Headset particle/overlay budgets are lower while control ranges and behavior stay identical; particles and geometry move around the score, never the camera.
