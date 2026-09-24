# Harmonic.OS — Math Harmonics Visualizer

An interactive mathematical visualizer for desktop, **Apple Vision Pro**, and **Meta Quest** (WebXR). 271 formulas — parametric curves, true (p,q) surfaces (Klein bottle, supershapes, seashells), attractor-inspired families — rendered through 380+ GLSL shaders, 16 physical material profiles, and 10 light rigs, with audio-reactive visuals driven by live microphone analysis.

**Live:** https://d-10-g.github.io/math-harmonics/

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
