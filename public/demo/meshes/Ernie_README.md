# Ernie and the MIDI model stage

Ernie is a stylized, rigged study derived from the original `Cat.obj`. His texture follows the supplied tuxedo-cat references. The original mesh remains unchanged.

## Files

All Ernie assets now live together in `public/demo/meshes`:

- `Ernie_master.blend`: editable Blender master; packed texture, 20-bone FK rig, 32 actions.
- `Ernie_model.glb`: animated model with embedded texture and clips.
- `Ernie_model.obj`, `Ernie_model.mtl`, `Ernie_BaseColor.png`: static textured model.
- `Ernie_movements.json`: movement display names and exact GLB clip names.
- `Ernie_preview.png`, `Ernie_source.png`: reference renders.

In Blender, select Ernie_Rig and choose a numbered action in the Action Editor to preview frames 1–25. NLA tracks are muted at rest. The rig uses regional skin weights and FK; eye compression approximates blinking. Reopen the file to see disk changes made by the generator.

## Note Visuals

Enable Audio Sync and MIDI File. Under Note Visuals choose **3D GLB**, **Formulas**, or **3D OBJ**. GLB and OBJ share a compact model stage. Each actual MIDI channel gets a row; its used pitches are sorted low to high, spaced 0.28 units apart at the default Note Spread setting and centered by note count. Rows are 0.62 units apart and rise 0.14 units toward the back. Models fit a standard envelope, and the camera frames the entire arrangement.

**All Notes** keeps every used channel/pitch pair visible. **Sounding Only** hides inactive slots after a 160 ms note-off release, without shifting the remaining slots. With no score, a stationary audition grid remains available. Labels can be hidden. Hold a visible model to audition it at the selected velocity. Inspect one model shows the first score slot.

Random model and movement assignments are stable per channel until reshuffled. Every note within a channel uses its assigned model and movement. The channel selectors allow explicit overrides. The global GLB movement override is optional. A GLB with no embedded animation, or a static OBJ, pulses with note velocity. Ernie's gestures have 1.65 times their initial angular range; short notes reach a visible accent before release. Score playback follows the existing audio transport, including pause, seek and loops.

## Saved mappings

Enter a name such as `Pavane` and choose **Save mappings** to download `Pavane_mappings.json`. **Load mappings** restores the format and exact channel/model/movement choices. Channel numbers in files are 1–16. Unknown assets, invalid clips and duplicate channels are rejected. Random choices are resolved when exporting; the seed is also stored for models without movement metadata. Preferences persist separately for GLB and OBJ in local storage.

A mapping file uses `schema: "3D_to_channel_mappings"`, `version: 1`, `kind: "glb"` or `"obj"`, a name, seed, and a `channels` array containing `channel`, `asset` and `movement` fields. Example:

```json
{
  "schema": "3D_to_channel_mappings",
  "version": 1,
  "name": "Pavane",
  "kind": "glb",
  "seed": 1234,
  "channels": [
    {"channel": 1, "asset": "Ernie_model.glb", "movement": "01_Head_nod"},
    {"channel": 2, "asset": "Ernie_model.glb", "movement": "25_Tail_left"}
  ]
}
```

Add more `.glb` or `.obj` files to `public/demo/meshes`. `npm run dev` and `npm run build` regenerate the catalog. For `Name.glb` or `Name_model.glb`, an optional `Name_movements.json` supplies an array of `{ "name": "Display label", "clip": "Exact embedded clip name" }` objects. Ernie and Kira are available as GLB models with separate movement catalogs; the existing OBJ library is also selectable.

## Backgrounds

The 3D model stage supports Cosmos, Midnight, Charcoal, Slate, Ivory and White. The HDRI choice loads a local equirectangular `.hdr` or `.exr` panorama and generates environment lighting for the materials. Files stay local; an uploaded HDRI must be reselected after a page reload. Gaussian splat backgrounds are deferred, not implemented.

## Rebuild and checks

From the repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background -t 6 --python scripts/Ernie_build.py
npm run models:catalog
npx tsx scripts/Ernie_validate.ts
npx tsx scripts/validate-model-channels.ts
npm run lint
npm run build
```

Regeneration replaces generated assets; save hand-edited Blender work separately. Tests cover exported rig independence, all 32 gestures, short notes, velocity, overlapping notes, release, seek sampling, compact row placement, mapping validation and exact save/load resolution. Desktop browser controls and rendering are checked; large-score performance and XR support for this model stage are not validated.

Browser checks: GLB/OBJ switching, label visibility, explicit channel movements, JSON download, light background, and Pavane playback in both visibility modes passed without browser errors. Custom HDRI loading is implemented but has not been exercised with a user-provided panorama.
