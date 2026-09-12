# Object layouts and copies

Under Audio Sync → MIDI File, use **Channel geometry** below **Note Spread**:

- Linear preserves the original channel rows.
- Circle closes each channel into a ring without repeating its endpoint.
- Spiral places each channel along a two-turn expanding spiral.
- Wave bends each row into two waves.
- Helix winds each channel upward through two turns.

**Note Spread** still controls distance along the selected path. Models retain
consistent MIDI channel/pitch identities, so notes do not rearrange as other
notes start and stop. Formula constellations use the score-wide pitch order for
the same reason. These settings affect note constellations and OBJ/GLB layouts;
they do not change the shape of a standalone formula.

**Copies per note** ranges from 1–8 and includes the original. **Copy offset**
ranges from 0–4 and separates repeated layouts vertically. It is disabled at
one copy; zero offset intentionally overlays the copies. The offset is relative
to the scene's normal channel scale and is independent of Note Spread. Copies
follow the original notes and movements without duplicating playback. The
single-model inspection mode continues to show one object.

The camera / XR fit accounts for the expanded model bounds. Increasing spread
or adding copies can make objects smaller on screen to keep the arrangement in
view. Formula copies share geometry and materials, so formulas are evaluated
once rather than once for every copy.

Settings are saved locally and included in shared links (`nlg`, `nlc`, `nlo`).
Old links retain Linear / one copy defaults. The shared VR menu exposes the same
controls under **Object layout**.

Run `npm run validate:layouts` for geometry, spacing, duplicate identity,
framing, normalization, and shared-resource regression checks.
