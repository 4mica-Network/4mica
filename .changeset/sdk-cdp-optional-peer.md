---
"@4mica/sdk": minor
---

`@coinbase/cdp-sdk` is now an optional peer dependency. It used to be an
optional dependency, so every install of `@4mica/sdk`, and of `@4mica/cli`,
brought it and its own dependencies along, although only `createCdpAccount`
uses it. Those include `zod` 3, which has an open advisory
(GHSA-mrhx-c7xc-m3w5) and no fixed 3.x release.

If you call `createCdpAccount`, add the package to your project:

```bash
npm install @coinbase/cdp-sdk
```

Without it, `createCdpAccount` throws a `ConfigError` that says so. Nothing
else in the SDK changes.
