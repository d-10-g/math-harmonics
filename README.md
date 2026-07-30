# Harmonic.OS — Math Harmonics Visualizer

An interactive mathematical visualizer for desktop, **Apple Vision Pro**, and **Meta Quest** (WebXR). 271 formulas — parametric curves, true (p,q) surfaces (Klein bottle, supershapes, seashells), attractor-inspired families — rendered through 380+ GLSL shaders, 16 physical material profiles, and 10 light rigs, with audio-reactive visuals driven by live microphone analysis.

**Live:** https://d-10-g.github.io/math-harmonics/

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
