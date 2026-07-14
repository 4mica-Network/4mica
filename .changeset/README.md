# Changesets

This folder is managed by [Changesets](https://github.com/changesets/changesets). It versions and
publishes the `@4mica/sdk*` package family.

## Adding a changeset

When you make a change that should be released, run:

```bash
pnpm changeset
```

Pick the affected packages and a bump type (patch/minor/major), then write a short summary. The
`@4mica/sdk*` packages are **fixed** together — bumping one bumps them all to the same version.

The scaffold-only adapters (`@4mica/sdk-nuxt`, `@4mica/sdk-sveltekit`, `@4mica/sdk-remix`) and all
private workspace packages are ignored and never published from here.

Merging the auto-generated "Version Packages" PR on `main` publishes to npm via
`.github/workflows/release.yml`.
