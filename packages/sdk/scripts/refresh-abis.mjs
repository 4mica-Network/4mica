// Regenerate src/abi/core4mica.ts and src/abi/clearinghouse.ts from the
// monorepo's contracts/abi/*.json. Invoked by scripts/refresh-abis.sh at the
// repo root; can also be run directly:
//
//   node packages/sdk/scripts/refresh-abis.mjs
//
// The output is formatted with Biome so re-running is a no-op.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, "..");
const repoRoot = resolve(pkgRoot, "../..");
const abiDir = resolve(repoRoot, "contracts/abi");
const source = readFileSync(resolve(abiDir, "SOURCE"), "utf8").trim();

const targets = [
  {
    json: "Core4Mica.json",
    out: "src/abi/core4mica.ts",
    name: "core4micaAbi",
    doc: [
      "Core4Mica contract ABI.",
      "",
      "Users deposit collateral, request/cancel/finalize withdrawals, and read",
      "their positions here. The `*WithAuthorization` / `*WithPermit2` entries",
      "are the gasless variants a facilitator submits on a user's behalf; the",
      "error entries let viem decode every revert by name.",
    ],
  },
  {
    json: "ClearingHouse.json",
    out: "src/abi/clearinghouse.ts",
    name: "clearingHouseAbi",
    doc: [
      "4Mica ClearingHouse contract ABI.",
      "",
      "A settlement cycle nets each participant's obligations into a single",
      "net-debit or net-credit committed to an on-chain Merkle root.",
      "Participants settle by submitting their leaf + proof to `payNetDebit` /",
      "`claimNetCreditFor`. The contract address and proof are provided by core",
      "via `getClearingSettlementAction`. The error entries let viem decode",
      "ClearingHouse reverts by name.",
    ],
  },
];

const written = [];
for (const target of targets) {
  const { abi } = JSON.parse(
    readFileSync(resolve(abiDir, target.json), "utf8"),
  );
  const file = [
    "/**",
    ...target.doc.map((line) => (line ? ` * ${line}` : " *")),
    " *",
    " * GENERATED FILE — do not edit by hand. Regenerate with",
    " * `scripts/refresh-abis.sh` at the repo root.",
    ` * Source: ${source}`,
    " */",
    'import type { Abi } from "viem";',
    "",
    `export const ${target.name} = ${JSON.stringify(abi, null, 2)} as const satisfies Abi;`,
    "",
  ].join("\n");
  const outPath = resolve(pkgRoot, target.out);
  writeFileSync(outPath, file);
  written.push(outPath);
}

execFileSync("pnpm", ["exec", "biome", "format", "--write", ...written], {
  cwd: repoRoot,
  stdio: "inherit",
});
for (const path of written) console.log(`wrote ${path}`);
