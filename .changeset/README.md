# Changesets

This folder is managed by [Changesets](https://github.com/changesets/changesets). It versions and
publishes the `@4mica/sdk*` package family.

## Adding a changeset

When you make a change that should be released, run:

```bash
pnpm changeset
```

Pick the affected packages and a bump type (patch/minor/major), then write a short summary.

Private workspace packages are never published from here.

Merging the auto-generated "Version Packages" PR on `main` publishes to npm via
`.github/workflows/release.yml`.
