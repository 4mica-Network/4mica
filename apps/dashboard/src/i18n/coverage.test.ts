import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COLLECTIONS, type Collection } from "./index";
import { LAZY_TRANSLATIONS, type TranslatedModule } from "./manifest";
import { collectionFile } from "./testCatalogues";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const NOT_TRANSLATION_KEYS = new Set([
  "onboarding.business",
  "onboarding.complete",
]);

const ALIASES: [string, string][] = [
  ["@/", "."],
  ["@api/", "api"],
  ["@stores/", "stores"],
  ["@utils/", "utils"],
  ["@i18n/", "i18n"],
];
const BARE_ALIASES: Record<string, string> = {
  "@i18n": "i18n",
  "@stores": "stores",
};

const collectionOf = new Map<string, Collection>();
for (const collection of COLLECTIONS) {
  for (const key of Object.keys(collectionFile("en", collection) ?? {})) {
    collectionOf.set(key, collection);
  }
}
const KEYS = [...collectionOf.keys()];

const isFile = (path: string) => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

const resolveImport = (from: string, specifier: string): string | null => {
  let base: string | null = null;
  if (BARE_ALIASES[specifier]) {
    base = join(SRC, BARE_ALIASES[specifier]);
  } else if (specifier.startsWith(".")) {
    base = resolve(dirname(from), specifier);
  } else {
    for (const [alias, dir] of ALIASES) {
      if (specifier.startsWith(alias)) {
        base = join(SRC, dir, specifier.slice(alias.length));
        break;
      }
    }
  }
  if (!base) {
    return null;
  }
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    if (isFile(candidate)) {
      return candidate;
    }
  }
  return null;
};

interface ParsedModule {
  staticImports: string[];
  dynamicImports: string[];
  keys: Set<string>;
}

const keysForLiteral = (literal: string): string[] => {
  if (NOT_TRANSLATION_KEYS.has(literal)) {
    return [];
  }
  const prefix = literal.endsWith(".") ? literal : `${literal}.`;
  return KEYS.filter(
    (key) =>
      key === literal ||
      key.startsWith(`${literal}_`) ||
      key.startsWith(prefix),
  );
};

const parsed = new Map<string, ParsedModule>();
const parse = (file: string): ParsedModule => {
  const cached = parsed.get(file);
  if (cached) {
    return cached;
  }
  if (!/\.tsx?$/.test(file) || /\.test\.tsx?$/.test(file)) {
    const empty = {
      staticImports: [],
      dynamicImports: [],
      keys: new Set<string>(),
    };
    parsed.set(file, empty);
    return empty;
  }
  const source = readFileSync(file, "utf8");
  const code = source
    .replace(/^\s*import type[\s\S]*?;$/gm, "")
    .replace(/^\s*export type[\s\S]*?;$/gm, "");
  const staticImports = [
    ...code.matchAll(
      /(?:^|\n)\s*(?:import|export)\s+(?:[^'"]*?from\s+)?["']([^"']+)["']/g,
    ),
  ]
    .map((match) => resolveImport(file, match[1]))
    .filter((path): path is string => path !== null);
  const dynamicImports = [...code.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)]
    .map((match) => resolveImport(file, match[1]))
    .filter((path): path is string => path !== null);

  const literals = new Set<string>();
  for (const match of source.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)) {
    let value = match[1] ?? match[2] ?? match[3];
    if (match[3] !== undefined && value.includes("${")) {
      value = `${value.slice(0, value.indexOf("${"))}`;
      if (/^[A-Za-z]+\.[\w.]*$/.test(value)) {
        literals.add(value.endsWith(".") ? value : `${value}.`);
      }
      continue;
    }
    if (
      /^[A-Za-z]+\.[\w.]*$/.test(value) ||
      (/^\w+$/.test(value) && collectionOf.has(value))
    ) {
      literals.add(value);
    }
  }
  for (const match of source.matchAll(/\bns=(?:"|\{")(\w+)"/g)) {
    literals.add(`${match[1]}.`);
  }
  const keys = new Set([...literals].flatMap(keysForLiteral));

  const result = { staticImports, dynamicImports, keys };
  parsed.set(file, result);
  return result;
};

const moduleId = (file: string) =>
  relative(SRC, file)
    .replace(/\.(tsx?)$/, "")
    .replace(/\/index$/, "");

const declared = new Set<string>(Object.keys(LAZY_TRANSLATIONS));

const reach = (entry: string) => {
  const files = new Set<string>();
  const lazyEntries = new Set<string>();
  const stack = [entry];
  while (stack.length > 0) {
    const file = stack.pop() as string;
    if (files.has(file)) {
      continue;
    }
    files.add(file);
    const module = parse(file);
    stack.push(...module.staticImports);
    for (const target of module.dynamicImports) {
      if (declared.has(moduleId(target))) {
        lazyEntries.add(target);
      } else {
        stack.push(target);
      }
    }
  }
  return { files, lazyEntries };
};

const collectionsUsed = (files: Set<string>) => {
  const used = new Map<Collection, string[]>();
  for (const file of files) {
    for (const key of parse(file).keys) {
      const collection = collectionOf.get(key) as Collection;
      const examples = used.get(collection) ?? [];
      if (examples.length < 3) {
        examples.push(`${moduleId(file)}: ${key}`);
      }
      used.set(collection, examples);
    }
  }
  return used;
};

const firstLoad = reach(join(SRC, "main.tsx"));

const lazyModules = new Set<string>();
const queue = [...firstLoad.lazyEntries];
while (queue.length > 0) {
  const entry = queue.pop() as string;
  if (lazyModules.has(entry)) {
    continue;
  }
  lazyModules.add(entry);
  queue.push(...reach(entry).lazyEntries);
}

const allSourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? allSourceFiles(path) : [path];
  });

describe("translation coverage", () => {
  it("serves the first load from the bundled core collection alone", () => {
    const outside = [...collectionsUsed(firstLoad.files)].filter(
      ([collection]) => collection !== "core",
    );

    expect(Object.fromEntries(outside)).toEqual({});
  });

  it("finds the lazy modules the manifest declares", () => {
    expect([...lazyModules].map(moduleId).sort()).toEqual([...declared].sort());
  });

  it.each(
    Object.keys(LAZY_TRANSLATIONS) as TranslatedModule[],
  )("%s declares exactly the collections it uses", (id) => {
    const entry = resolveImport(join(SRC, "x"), `@/${id}`);
    expect(entry, `${id} does not exist`).not.toBeNull();

    const used = collectionsUsed(reach(entry as string).files);
    used.delete("core");
    const declaredHere = new Set<Collection>(LAZY_TRANSLATIONS[id]);

    const missing = [...used].filter(
      ([collection]) => !declaredHere.has(collection),
    );
    const unused = [...declaredHere].filter(
      (collection) => !used.has(collection),
    );

    expect(Object.fromEntries(missing), "used but not declared").toEqual({});
    expect(unused, "declared but not used").toEqual([]);
  });

  it("leaves no lazily imported translated module out of the manifest", () => {
    const undeclared: string[] = [];
    for (const file of allSourceFiles(SRC)) {
      for (const target of parse(file).dynamicImports) {
        const id = moduleId(target);
        if (declared.has(id)) {
          continue;
        }
        const used = collectionsUsed(reach(target).files);
        used.delete("core");
        if (used.size > 0) {
          undeclared.push(`${moduleId(file)} -> ${id}`);
        }
      }
    }

    expect(undeclared).toEqual([]);
  });
});
