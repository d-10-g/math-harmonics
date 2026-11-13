# Harmonic.OS — Math Harmonics Visualizer

An interactive mathematical visualizer for desktop, **Apple Vision Pro**, and **Meta Quest** (WebXR). 271 formulas — parametric curves, true (p,q) surfaces (Klein bottle, supershapes, seashells), attractor-inspired families — rendered through 380+ GLSL shaders, 20 physical material profiles, and 10 light rigs, with audio-reactive visuals driven by live microphone analysis.

**Live:** https://d-10-g.github.io/math-harmonics/

## v2.18.0 — Light sculptures: aurora silk, constellations, and clockwork

- Three new complete scenes in **Prism → Flight FX laboratory**: **Aurora Dream** drapes rippling silk light over holographic knots and icy drops; **Quantum Garden** weaves nearby notes into constellations around holographic atoms and jade crystals; **Clockwork Nebula** surrounds copper gears, golden rings, and animated Kira with nested orbital gyroscopes. Each mixes GLB, OBJ, and built-in forms with its own materials and light rig. The previous four scenes remain available.
- Three independent 0–200% dials add **Aurora silk**, **Chord constellations**, and **Orbital gyroscopes** to any flight. Curtains ripple in real depth; constellation threads connect nearby notes across channels; gyroscopic hoops bank around recent note positions. These layers combine with all existing sparks, lasers, tracers, shockwaves, and morphs.
- Two new motion fields: **Corkscrew flight** rolls the forms through a depth spiral; **Butterfly figure eight** banks them through a crossing, winglike path. Both work on static meshes and animated rigs. Their shader and CPU transforms agree, with corrected surface normals on deformed physical materials.
- New layers use bounded recent pools, lower headset density, and at most three additional GPU batches. Disabled layers allocate no GPU buffers; score time controls every ripple and rotation, so pause and backward seeking remain deterministic. Old links retain their previous appearance with the new layers off.
- All seven scenes, every dial, and all seven motion choices appear in the shared desktop/VR menus and persist through reloads and **Copy Link**. **Clear flight FX** removes the extras while preserving models, materials, and lighting. Regression checks cover dense-score bounds, constellation identity, seeking, normals, resource cleanup, real catalog references, and menu/state parity. Headset hardware still needs testing.

Try **Aurora Dream**, then turn up **Orbital gyroscopes** for a silk-and-clockwork remix. Choosing a showcase replaces the visual scene while preserving the loaded score; the individual dials preserve your channel assignments.

## v2.17.0 — Flight FX laboratory: supernovas, lasers, and liquid worlds

- Four complete surprise scenes under **Prism → Flight FX laboratory**: **Supernova** (starbursts and expanding halos), **Neon Highway** (laser filaments and comet ribbons), **Cosmic Jelly** (breathing glass, liquid shapes, and rigged models), and **Stargate** (swirling torus gates and shockwaves). Each scene curates the channel visuals, materials, light rig, bloom, paths, and effect mix together. Existing six flight looks remain available.
- Mix the effects yourself: **Starbursts**, **Shockwave rings**, **Laser filaments**, **Ribbon tracers**, and **Liquid morph** each have an independent dial. Lasers and tracers connect consecutive notes only within the same MIDI channel and break across rests. Sparks scatter from note attacks; halos expand in each channel plane. View-facing ribbons remain visible when orbiting and in stereo.
- **Motion field** adds satellite orbits, vortex spin, sine-wave surfing, or breathing pulses. Static shapes and app-material OBJ meshes deform with corrected surface normals; original OBJ materials retain their authored look while the model moves, breathes, and stretches. GLB bodies gain kinetic squash and motion while their skeletal gestures remain intact.
- All animation follows absolute score time: pause freezes the effects, and seeking recreates the same seeded sparks, waves, motion, and morphs. Effects are optional; old links default to zero extra FX. **Clear flight FX** restores the base motion and removes the extras while retaining the channel choices and lighting. The dials can combine FX with any existing flight look.
- Effects use at most four additional draw batches with bounded recent note/link pools and lower headset particle/history budgets. Disabled effects allocate no GPU buffers. No camera shake is added. Scene switches and shader changes release their owned buffers/materials while preserving cached model resources.
- Every new preset, dial, motion choice, and disabled state has matching desktop/VR controls under **Controls · Flight FX**. FX settings persist in reloads and Copy Link. Added regressions cover 20,000-note effect pools, channel-link identity, exact seeking, analytic normal correction, rig isolation, shared controls, and real catalog references in all four scenes.

Choose **Audio → MIDI File → Note Visuals → Prism**, open **Flight FX laboratory**, and try **Supernova** or **Neon Highway**. A showcase preserves your current score; with no score loaded it stages Mercury. Clear removes only FX, while choosing a showcase replaces the visual scene. Headset hardware still needs testing; desktop production shaders and deployment assets are verified separately.

## v2.16.0 — Mixed flights, one source and material per channel

- **Flight studio → Mixed flight** combines animated GLBs, OBJ sculptures, and built-in shapes in the same moving score. Each active MIDI channel has its own **Source**, model or shape, and **Material** controls. Unassigned channels alternate GLB, OBJ, and built-in defaults; existing GLB assignments carry over.
- GLB channels retain Ernie/Kira and their rig-specific movements. OBJ channels can choose any of the 132 library sculptures. Built-in channels offer prism fans, spheres, crystals, tori, and knots. All channel choices are independent and survive reloads and **Copy Link**.
- Materials include the 20 physical profiles, luminous Spectrum for static shapes/OBJ geometry, and Original authored materials for imported models. Explicit channel materials override the global Output material; Auto follows the finish family. On GLB rigs, spectral finishes use physical materials that preserve skin animation. Global Prism Colour/Slice Width affect static trails using app materials; Original retains authored colors.
- Mixed flights share the same deterministic channel paths, sustain timing, trail memory, and backward seeking as the existing modes. A bounded pool and geometry budget keep mixed history manageable, with a smaller pool in XR. Loading or failure of an individual asset leaves markers on that channel while the others continue.
- The same source, model/shape, movement, and material controls appear in **VR → All 2D Menus → Controls · Flight channels**. New mixed/static regressions cover material isolation, resource ownership, three-source selection, and exact seeking alongside the existing GLB, menu, layout, and share-link checks.

Choose **Audio → MIDI File → Note Visuals → Prism → Mixed flight**, then edit **Flight channels**. Use a multi-channel score such as Firebird or Jupiter to see several assignments together. The original single-source looks remain available.

## v2.15.0 — Animated GLB flight trails and channel materials

- **Flight studio → Animated flight** paints animated GLB models along the same independent channel paths as the prism. Notes drive their embedded gestures while held, including sustain; released models keep their sampled pose as the flight moves on. Models keep their proportions instead of stretching into extrusions.
- **Animated channel models** gives every active MIDI channel its own GLB model, movement, and material. Choose Ernie or Kira, any of that rig’s 32 gestures, the original authored GLB materials, or any of the 20 physical profiles. Auto alternates rigs and finishes by channel; explicit channel choices override the global Output material.
- Channel mappings persist locally and in **Copy Link** along with all flight settings. Switching the model resets incompatible movement choices; malformed settings are validated against the bundled model and material catalogs. Existing prism and OBJ looks remain available.
- Animated history uses a bounded pool of recent models, with channel-fair selection: at most 48 on desktop and 24 in XR, further limited by geometry cost. This also applies when Trail memory is zero. Loading failures and history limits appear in Flight status. Cached geometry/textures are shared while cloned skeletons, materials, and animation mixers have separate ownership.
- All model, movement, and material controls appear in **VR → All 2D Menus → Controls · GLB flight channels**, with the same options and behavior. Desktop browser and rig/seek regressions validate the implementation; headset hardware still needs testing.

Choose **Audio → MIDI File → Note Visuals → Prism → Animated flight**, then select the rig, material, and gesture under each channel. Spectral materials are luminous physical finishes on the GLB rigs; the original prism shader remains available on the other trail shapes.

## v2.14.0 — Flight studio: spectra, ornaments, and colored glass

- **Prism → Flight studio** adds four one-click looks: Spectral ribbons, Ornament parade, Glass constellations, and Sculpture flight. Mix six trail shapes (prism fan, sphere, crystal, torus, knot, any of the **132 OBJ sculptures**) with luminous-spectrum, polished-metal, or colored-glass surfaces. Existing classic prism settings remain compatible.
- **One plane per MIDI channel**, up to all 16 channels, now integrates its own steering path and heading. Flight divergence (0–2×) controls the weave; seeking restores the exact same geometry. Shared-plane mode remains available. Trail memory runs from 5–120 seconds or zero for the whole score; older strokes fade out. Detailed meshes keep the most recent notes within a geometry-dependent GPU budget.
- Four new global physical profiles: **Ornament Enamel, Champagne Gold, Stained Glass, Dichroic Crystal**. Metals get clearcoat highlights; glass gets transmission, dispersion, and volume absorption. Both renderers use the same physical optical settings. WebGPU now has the baked rig-reflection environment it previously lacked, with colored pin-light details across all ten rigs. Explicit Output materials apply to the flight shapes too.
- The spectrum shader now works on all trail shapes, with correct color-space output and defined smoothstep edges. Physical trail normals follow the growing strokes; future notes never draw, history uploads are bounded, and expired notes leave the draw window.
- All flight settings and presets appear in **VR → All 2D Menus → Controls · Prism canvas**, with the exact desktop ranges; all settings survive reloads and Copy Link. Flight/model/letter stages identify their WebGL renderer correctly. Browser snapshots work for these stages even with a stored WebGPU preference; Photo mode is limited to the formulas it actually renders.
- MIDI now preserves long final notes, trailing rests, and the initial tempo, validates malformed track boundaries, and searches tempo maps efficiently. OBJ/GLB gestures now honor pedal-extended note lengths. Audio-file replacements release their blob URLs; reflection render targets and pending thumbnail work release their resources.
- Keyboard shortcuts preserve native button/select behavior; search has a clear action and accessible name; focus outlines and a wrapping header improve keyboard and small-screen use. Invalid saved materials, mesh names, and numeric values are sanitized before rendering.
- Added MIDI, path/seek/window, physical-material/environment, and share-state/VR-control regressions to the Pages workflow. Run `npm run validate:midi`, `validate:prism`, `validate:materials`, and `validate:state` locally.

Choose **Audio → MIDI File → Note Visuals → Prism**, then try **Ornament parade**. Refraction is real-time screen-space transmission, so overlapping glass does not reproduce multi-bounce path tracing. Animated GLB rigs remain on the model stage; sculpture trails use the OBJ library. Desktop browser validation covers the rendered shaders; headset behavior still requires hardware testing.

## v2.13.0 — Letters: the Alphabet Sphere

- A third page beside Audio and Silent: **Letters** (the new header pill, or `?mode=letters`). 70,000 points fill a sphere; 26 viewing axes are spread over it on a Fibonacci spiral, and along each axis the points are arranged so that one capital letter snaps into focus only when you look straight down that axis. From anywhere else they are just the cloud. The perspective pre-compensation is computed in the vertex shader from the live viewing distance, so the letters stay crisp at the desktop orbit distance and as you walk up to the sphere in a headset.
- **Auto-Tour A → Z** flies from letter to letter and dwells on each; drag to orbit by hand (the tour steps aside), click a letter in the bar under the stage, or step with ← →. The badge names the aligned glyph and its axis angles.
- **Letter Relief**, **Collimation** and **Point Size** match the standalone page: relief pulls the aligned points forward into a sculpted bas-relief, which is what gives the letters real depth in stereo; collimation sets the contrast between letter and cloud; depth rings frame the sphere.
- Flat-screen stereo: cross-eye and parallel side-by-side views with fusion guides, red–cyan anaglyph, and a glasses-free wiggle view, all rendered through off-axis eye cameras with an adjustable baseline. In a headset the sphere floats in front of you at true scale, the tour turns the sphere to aim each letter at your head instead of moving you, and the usual grab, scale and turn gestures apply.
- The music keeps playing: the page lands with the session live like the audio page, the aligned letter pulses gently with the notes, and a score picker sits with the sphere's controls. Every setting is a share-link and VR-menu option.

## v2.12.1 — The audio page starts itself

- Landing on the audio page now behaves as if the AUDIO pill and the transport's play button had both been pressed: audio sync on, MIDI source, the default piece staged and playing. Reloads no longer drop back to the silent phase transport.
- Browsers refuse sound before a gesture unless the site has earned it (Chrome's media-engagement score does that for a regular visitor). When playback is refused the piece starts muted so the scene runs from the first frame, a small chip says so, and the first tap or key anywhere unmutes it.

## v2.12.0 — Prism colour slices and per-channel canvases

- **Prism Colour**: every note can carry the whole spectrum (as before) or a slice of it chosen by note value: pitch across the piece's range, pitch class (C is always the same colour in every octave), or note length. **Slice Width** sets how much of the spectrum each note shows, 5% to 50%.
- **Canvas**: one shared plane with an instrument row per channel, or one plane per channel. Per-channel planes sit on a ring around the line of travel and each drifts and wobbles on its own, so the trails weave as separate ribbons. Up to eight channels.
- Both are share-link and VR-menu options, and rebuild the score instantly.

## v2.11.0 — Prism canvas

- New note visual, **Prism** (Audio Sync → MIDI File → Note Visuals), separate from formulas and models. An invisible rectangular canvas rides a slow, curving path through space; every note is painted on it the instant it sounds as a dispersed prism spectrum (a white beam entering, a rainbow fanning out), sized by velocity, placed by pitch across and instrument row up, then stays exactly where it was painted while the canvas moves on.
- Held notes keep drawing, so they stretch into streaks that reach from their birth point to the canvas; the sustain pedal extends them. New notes flare white-hot and pop, sounding notes glow at full colour, and the trail settles into a receding tunnel of spectra that dims with age but never disappears.
- You ride the canvas: on the desktop orbit around it to look down the tunnel, in a headset it recedes in front of you. Note FX scales the flares and pops, Note Spread the canvas width, and the mirror dome and cosmos backdrop apply.
- The whole score is precomputed into one instanced draw, so twenty-thousand-note pieces run at full frame rate.

## v2.10.0 — Expressive MIDI: controllers, gesture strength, harder pops

- The MIDI parser now reads pitch bend, mod wheel, volume, expression, sustain and soft pedals, pan and aftertouch, per channel. Both stages act on them: pitch bend leans and slides a channel's objects, the mod wheel wobbles them, expression × volume sets their size and glow, aftertouch presses them larger, the sustain pedal lifts them while it is down and lets released notes ring on until it lifts, pan nudges them sideways. Note FX scales all of it and switches it off with the rest.
- Velocity hits harder: an attack pop that overshoots and settles within ~130 ms on the formula stage, and a squash-and-stretch hop on OBJ and GLB models.
- **Gesture strength** (GLB models, default 2×) pushes every rigged gesture past its keyframes by extrapolating from the rest pose, so the cats move visibly with each note.
- The model stage now defaults to the Slate background.
- Local HDR/EXR panoramas live in `hdr_exr/` at the repo root (ignored by git) instead of `public/`, so they no longer ride along into builds.

## v2.9.0 — Mirror dome and honest OBJ finishes

- **Mirror Dome** replaces the old reflector panels, which never showed a usable reflection (and could not under WebXR). The dome is an inverted sphere reflecting a live cube-camera capture of the scene, so every note object, the starfield and, in a headset, your own controllers appear mirrored around you. The capture point sits behind the visual relative to the viewer, so the wall you face carries a true mirror image; one cube face is captured per frame to keep the cost flat, and the dome hides in passthrough.
- Formula stage: **Output → Mirror Dome** (same `mr` share key). Model stage: **3D Background → Mirror dome (live reflections)**. Both reach VR through the shared menus.
- **OBJ finish** (Models and channel mappings): stand-in MTLs — the Blender debug green and default gray most library files carry, or files with no MTL — are now dressed in the app's physical material profiles instead of made-up palette hues. *Auto* keeps authored MTL colors and dresses only stand-ins; *App materials* and *MTL colors* force either. App materials follow the Output material profile, rotate per channel on *auto*, glow with each note, and the OBJ stage gains the rig's reflective environment.
- The WebGPU renderer's mirrors are the same live dome.

## v2.8.0 — Copy Rotation

- Copy Rotation adds a signed -180° to 180° yaw increment per duplicate, alongside Copy Offset.
- Available in desktop and VR Object layout controls for formula, OBJ, and GLB copies.
- Originals keep their orientation; old saved layouts default to 0°. Rotation is saved locally and in shared links.

## v2.7.0 — Shared VR menus and object layouts

- Shared desktop/VR menus with search, editors, model settings, and full control values.
- Linear, Circle, Spiral, Wave, and Helix note layouts with working Note Spread.
- 1–8 copies per note and adjustable vertical copy offset; audio plays once.
- OBJ/GLB model selection preserves the XR canvas; layouts are saved in shared links.
- The app header and browser tab display the release version. `version.json` identifies the deployed build.

Find the layout controls under **Audio Sync → MIDI File**, below **Note Spread**.
In VR, open **All 2D Menus → Object layout**. Browser-only operations leave immersive mode.
See [VR menus](docs/vr-menu-parity.md) and [object layouts](docs/note-layouts.md).

## v2.6.0 — MIDI model stage

- Rigged Ernie and Kira GLB cats, each with 32 MIDI-driven gestures.
- GLB / Formulas / OBJ note visuals, compact centered channel rows, optional note labels, and sounding-only or all-notes display.
- Random or explicit channel models and movements, saved as named JSON mappings.
- Light/dark backgrounds and local HDR/EXR panorama lighting for the desktop model stage.
- Corrected short-note animation timing and library-audio loading.

Choose **Audio Sync → MIDI File → Note Visuals → 3D GLB**. Blender masters and movement catalogs are in `public/demo/meshes`, with `Ernie_` and `Kira_` prefixes. See [Ernie usage](public/demo/meshes/Ernie_README.md) and [Kira usage](public/demo/meshes/Kira_README.md).

## Highlights

- **Two renderer paths**: WebGL (three.js + react-three-fiber — the path headsets use) and WebGPU (three/webgpu + TSL node materials)
- **WebXR**: immersive VR + passthrough AR via `@react-three/xr`. Gaze-and-pinch native on Vision Pro (one pinch drags the visual, two-hand pinch scales/turns); controllers + thumbstick locomotion + beat haptics on Quest
- **Spatial console**: in-headset control panel built on `@react-three/uikit` (tabs for playback, view, auto-pilot, and preset browsing)
- **Audio Beat Sync**: microphone FFT → beat-quantized preset cycling, plus smoothed bass/mid/treble energies that pulse lights, materials, and any shader declaring `uBass`/`uMid`/`uTreble`
- **Live editing**: mathjs formula editor (variables `p`, `q`, `t`, `s`) and raw GLSL editor, both with inline validation
- **Shareable state**: the URL hash captures formula/shader/material/lighting/settings; Copy Link reproduces your exact view

## Keyboard (desktop)

`Space` play/pause · `←→` formula · `↑↓` shader · `F` fullscreen · `?` help overlay · double-click resets the camera

## Development

```bash
npm install
npm run dev        # https://localhost:3000 (HTTPS if ./.cert exists, else HTTP)
npm run lint       # typecheck
npm run validate   # assert all formulas compile + evaluate finite over (p,q,t)
npm run validate:models # rig, MIDI, layout, and mapping regressions
npm run build      # production build to dist/
```

Headset testing on your LAN: `npm run dev` binds 0.0.0.0 — open `https://<your-ip>:3000` in the headset browser, or just use the deployed URL. Pushes to `main` auto-deploy to GitHub Pages via Actions.

Dev aids: `?hudpreview` renders the XR console in the desktop scene.

## Layout

```
src/
  App.tsx                  state container, audio analysis, keyboard, share links
  components/
    GraphView.tsx          WebGL + XR scene: geometry builders, gestures, environment
    SpatialConsole.tsx     in-XR control panel (uikit)
    WebGPUView.tsx         WebGPU + TSL path
    Sidebar.tsx            preset library (search, categories, favorites, thumbnails)
    Controls.tsx           editors + output configuration
  lib/
    clock.ts               rAF clock + audio bands outside React
    parametricSurface.ts   (p,q) surface mesh builder
    materials.ts           MeshPhysicalMaterial profiles
    lighting.ts            light-rig table (shared by both renderers)
    thumbnails.ts          canvas/WebGL preset thumbnails
    urlState.ts            hash/localStorage share state
  constants.ts             formula library
  shaders.ts               shader library
scripts/
  validate-formulas.ts     npm run validate
docs/IMPROVEMENT_PLAN.md   roadmap and status
```

## Electron (optional)

`npm run electron:start` runs the desktop wrapper; `npm run electron:build` packages a macOS app.
