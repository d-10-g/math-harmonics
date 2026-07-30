# Legacy one-shot scripts — DO NOT RUN

The three Python scripts here were one-shot generators that spliced presets
into `src/constants.ts` / `src/shaders.ts` by finding the *last* `];` in each
file. The files have since been restructured (composed export arrays now sit
at the end), so re-running any of them would corrupt both files and create
duplicate ids. They are kept for historical reference only.

`check_logs.cjs` targeted a dev server on port 3001 that no longer exists and
depends on puppeteer, which is not installed.
