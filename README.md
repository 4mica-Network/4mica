# 4Mica Homepage

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-10.28.2-orange)](https://pnpm.io/)
[![Turbo](https://img.shields.io/badge/Turbo-monorepo-ef4444)](https://turbo.build/)

The public website and technical documentation for 4Mica, the clearinghouse for
the agentic economy.

4Mica provides infrastructure for agents, applications, and APIs to transact on
instant programmable credit, earn yield, and settle at once. This repository
contains the open-source homepage, product pages, docs experience, and shared
workspace tooling used to build and ship the site.

## About 4Mica

4Mica is a lightweight credit layer for instant, on-chain commerce.

The site currently includes:

- Product and company pages for 4Mica.
- Technical docs for x402 integrations.
- TypeScript, Python, and Rust-oriented integration content.
- Wallet and network configuration through Reown AppKit and Wagmi.
- Static export deployment for CDN-backed hosting.

## Tech Stack

- [Next.js](https://nextjs.org/) 16 with the App Router.
- [React](https://react.dev/) 19.
- [Tailwind CSS](https://tailwindcss.com/) 4.
- [Turbo](https://turbo.build/) for monorepo task orchestration.
- [pnpm](https://pnpm.io/) workspaces for dependency management.
- [Biome](https://biomejs.dev/) for linting and formatting.
- [Vitest](https://vitest.dev/) for tests and coverage.
- [Reown AppKit](https://reown.com/appkit), [Wagmi](https://wagmi.sh/), and
  [Viem](https://viem.sh/) for wallet and chain integrations.

## Repository Structure

```txt
.
├── apps
│   └── web                 # Next.js website and docs app
├── packages
│   └── tsconfig            # Shared TypeScript configs
├── scripts                 # Workspace utility scripts
├── biome.json              # Lint and format configuration
├── pnpm-workspace.yaml     # Workspace package definitions
├── turbo.json              # Turbo task pipeline
└── package.json            # Root workspace scripts
```

## Getting Started

### Prerequisites

- Node.js 20 or newer.
- pnpm 10.28.2 or newer.
- A Reown project ID for wallet features.

Enable pnpm with Corepack if needed:

```bash
corepack enable
corepack prepare pnpm@10.28.2 --activate
```

Install dependencies:

```bash
pnpm install
```

Create a local environment file:

```bash
cp apps/web/.env.example apps/web/.env.local
```

Then set your Reown project ID:

```bash
NEXT_PUBLIC_PROJECT_ID=your_reown_project_id_here
NEXT_PUBLIC_REOWN_PROJECT_ID=your_reown_project_id_here
```

`NEXT_PUBLIC_PROJECT_ID` is the primary variable. The app also supports
`NEXT_PUBLIC_REOWN_PROJECT_ID` and `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` for
compatibility.

Start the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Development

Useful root commands:

```bash
pnpm dev          # Start all development tasks through Turbo
pnpm build        # Build the workspace
pnpm start        # Start production servers where supported
pnpm lint         # Run Biome checks
pnpm lint:write   # Apply safe Biome fixes
pnpm typecheck    # Run TypeScript checks
pnpm test         # Run tests
pnpm clean        # Clean generated files and root node_modules
```

Useful web app commands:

```bash
pnpm --filter @4mica/web dev
pnpm --filter @4mica/web build
pnpm --filter @4mica/web test
pnpm --filter @4mica/web test:watch
pnpm --filter @4mica/web test:coverage
pnpm --filter @4mica/web typecheck
pnpm --filter @4mica/web knip
```

The web app lives in `apps/web`. Most page routes are under `apps/web/app`, and
reusable UI sections are under `apps/web/components`.

## Biome Editor Setup

Biome is the formatter and linter for this repository. For the smoothest
contributor experience, install the official
[Biome VS Code extension](https://marketplace.visualstudio.com/items?itemName=biomejs.biome).

Recommended VS Code settings:

```json
{
  "editor.defaultFormatter": "biomejs.biome",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "quickfix.biome": "explicit",
    "source.organizeImports.biome": "explicit"
  },
  "[javascript]": {
    "editor.defaultFormatter": "biomejs.biome"
  },
  "[javascriptreact]": {
    "editor.defaultFormatter": "biomejs.biome"
  },
  "[typescript]": {
    "editor.defaultFormatter": "biomejs.biome"
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "biomejs.biome"
  },
  "[json]": {
    "editor.defaultFormatter": "biomejs.biome"
  }
}
```

You can also run Biome from the terminal:

```bash
pnpm lint         # Check formatting, lint rules, and import organization
pnpm lint:write   # Apply safe fixes
pnpm lint:linter  # Apply linter fixes only
```

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_PROJECT_ID` | Yes | Primary Reown AppKit project ID. |
| `NEXT_PUBLIC_REOWN_PROJECT_ID` | Fallback | Alternate Reown project ID name. |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Fallback | Legacy WalletConnect project ID name. |
| `NEXT_PUBLIC_APP_URL` | No | Public app URL used for metadata. Defaults to `https://4mica.xyz`. |
| `NEXT_PUBLIC_VERCEL_URL` | No | Vercel-provided URL fallback for metadata. |
| `NEXT_PUBLIC_4MICA_CORE_CONTRACT_SEPOLIA` | Deploy-time | Sepolia core contract address for hosted builds. |
| `NEXT_PUBLIC_4MICA_CORE_CONTRACT_AMOY` | Deploy-time | Polygon Amoy core contract address for hosted builds. |

## Testing and Quality

Before opening a pull request, run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Biome is configured as the source of truth for linting and formatting. The
workspace also includes Husky, lint-staged, Knip, Taze, and Vitest coverage
tooling for maintainers.

## Deployment

The Next.js app is configured with:

```ts
output: "export"
```

That means `pnpm build` produces a static export in `apps/web/out`, which can be
served by any static hosting provider.

The included GitHub Actions workflow deploys pushes to `main` by:

1. Installing dependencies.
2. Building the site.
3. Uploading static assets to S3 with cache headers.
4. Invalidating CloudFront.

Required deployment secrets and variables include:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `S3_BUCKET`
- `CLOUDFRONT_DISTRIBUTION_ID`
- `NEXT_PUBLIC_PROJECT_ID`
- `NEXT_PUBLIC_REOWN_PROJECT_ID`
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_4MICA_CORE_CONTRACT_SEPOLIA`
- `NEXT_PUBLIC_4MICA_CORE_CONTRACT_AMOY`

## Contributing

We want this project to feel good to contribute to: clear setup, small focused
pull requests, and respectful review.

1. Fork the repository.
2. Create a feature branch:

   ```bash
   git checkout -b feat/your-change
   ```

3. Install dependencies and start the app:

   ```bash
   pnpm install
   pnpm dev
   ```

4. Make your changes.
5. Run the quality checks:

   ```bash
   pnpm lint
   pnpm typecheck
   pnpm test
   pnpm build
   ```

6. Open a pull request with a concise description, screenshots for visual
   changes, and any deployment or environment notes.

Good first contributions include copy improvements, documentation fixes,
accessibility improvements, test coverage, and small UI polish.

## Contributors

Thanks to everyone who helps build 4Mica.

See the full contributor graph on GitHub:
[github.com/4mica-Network/homepage/graphs/contributors](https://github.com/4mica-Network/homepage/graphs/contributors)

## Acknowledgements

4Mica is built with and inspired by excellent open-source projects, including
Next.js, React, Tailwind CSS, Turbo, pnpm, Biome, Vitest, Reown AppKit, Wagmi,
Viem, Radix UI, Lucide, Framer Motion, and the broader x402 ecosystem.

## License

This project is licensed under the [MIT License](./LICENSE).
