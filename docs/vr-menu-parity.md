# VR menus

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
movement mappings, OBJ finish, gesture strength, backgrounds (including the mirror dome), and
settings import/export. Conditional
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
