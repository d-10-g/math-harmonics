# Kira

A stylized companion to Ernie, built in Blender from the original Cat.obj and the supplied Kira photographs. Kira has a fuller torso, soft blue-charcoal coat, golden eyes, gray paws and muzzle, and silver-gray whiskers. The standing source silhouette is retained; the reference photos show her resting and crouching.

## Assets

- Kira_master.blend — editable master, packed UV texture, 20-bone FK rig and 32 actions.
- Kira_model.glb — animated runtime model, embedded texture and named clips.
- Kira_movements.json — exact clip names, display names and durations.
- Kira_model.obj / Kira_model.mtl / Kira_BaseColor.png — static textured export.
- Kira_preview.png — studio portrait.
- Kira_pose_*.png — six representative deformation checks.

## Use

Refresh the app, choose Note Visuals → 3D GLB, and select Kira_model.glb for a channel. Choose a specific Kira movement or leave that channel on Random. Kira and Ernie can share a score on different channels. Saved mappings preserve their distinct clip names. Existing velocity, short-note timing, release, visibility and label controls apply to both cats.

Kira's 32 clips last approximately 0.75–1.4 seconds and return to rest. They include listening, bird watching, chirping, slow blinks, ear motions, paw curls, alternating kneads, grooming gestures, playful bats, shoulder/hip settling and tail accents. These are lightweight FK gestures, not collision-aware locomotion or anatomically solved grooming. Blinks compress eye geometry.

In Blender select Kira_Rig and choose a Kira action in the Action Editor. Each action has its own frame range. NLA tracks are muted by default so the saved model rests. Use Pose Mode for manual control.

## Rebuild and validate

Run from the repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background -t 6 --python scripts/Kira_build.py
npm run models:catalog
npx tsx scripts/Ernie_validate.ts Kira
npx tsx scripts/validate-model-channels.ts
npm run lint
npm run build
```

The shared rig validator accepts either Ernie or Kira. It checks 32 exported clips, movement-manifest parity, independent cloned skeletons, rest restoration, score-driven deformations, velocity/release behavior and layout. Regeneration overwrites Kira's generated files; save hand-edited work separately.
