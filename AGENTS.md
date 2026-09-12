# Release identification

The user requires every user-visible code update to have a distinguishable
version. Before reporting an update complete:

- Bump `package.json` and the root package versions in `package-lock.json` for
  each logical update. Use a minor bump for features and a patch bump for fixes.
- Keep the README release notes current. The app header, browser title, and
  generated `version.json` must all reflect the package version.
- State whether an update is local or published. A local build does not update
  GitHub Pages. When publishing is requested, finish the Pages workflow and
  verify the version and changed assets on the live site before reporting it live.
- Run lint, relevant validations, and the production build. Layout/menu/model
  changes use `validate:layouts`, `validate:menus`, and `validate:models`.
- Preserve unrelated working-tree files; stage only the intended release files.
