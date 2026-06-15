import { links } from "@services/links";

export const dynamic = "force-static";

const PROTECTED_PATHS = [
  "/api",
  "/api/*",
  "/_next",
  "/_next/*",
  "/admin",
  "/admin/*",
];

const isProductionEnvironment = () => process.env.NODE_ENV === "production";

export type LlmsRule =
  | string
  | {
      model?: string | string[];
      allow?: string | string[];
      disallow?: string | string[];
      purpose?: string | string[];
    };

export type LlmsConfig = {
  version?: string;
  contact?: string;
  policy?: string | string[];
  references?: string | string[];
  rules: LlmsRule | LlmsRule[];
};

const toAbsoluteUrl = (path: string) => new URL(path, links.website).toString();

const PRODUCTION_RULES: LlmsRule[] = [
  {
    model: "*",
    allow: "/",
  },
  {
    model: "*",
    disallow: PROTECTED_PATHS,
    purpose: "protect sensitive application routes",
  },
];

const NON_PRODUCTION_RULE: LlmsRule = {
  model: "*",
  disallow: "/",
  purpose: "environment is not production",
};

const POLICY_URLS = [toAbsoluteUrl(links.terms), toAbsoluteUrl(links.privacy)];

const normalizeValues = (value: string | string[] | undefined) => {
  if (!value) return [];

  return Array.isArray(value) ? value : [value];
};

const serializeRule = (rule: LlmsRule) => {
  if (typeof rule === "string") return [rule];

  return [
    ...normalizeValues(rule.model).map((model) => `Model: ${model}`),
    ...normalizeValues(rule.allow).map((path) => `Allow: ${path}`),
    ...normalizeValues(rule.disallow).map((path) => `Disallow: ${path}`),
    ...normalizeValues(rule.purpose).map((purpose) => `Purpose: ${purpose}`),
  ];
};

const serializeLlmsConfig = (config: LlmsConfig) => {
  const rules = Array.isArray(config.rules) ? config.rules : [config.rules];
  const lines = [
    "# 4Mica llms.txt",
    config.version ? `Version: ${config.version}` : undefined,
    config.contact ? `Contact: ${config.contact}` : undefined,
    ...normalizeValues(config.policy).map((policy) => `Policy: ${policy}`),
    ...normalizeValues(config.references).map(
      (reference) => `Reference: ${reference}`,
    ),
    "",
    ...rules.flatMap((rule, index) => [
      index > 0 ? "" : undefined,
      ...serializeRule(rule),
    ]),
  ].filter((line): line is string => typeof line === "string");

  return `${lines.join("\n")}\n`;
};

export function llms(): LlmsConfig {
  if (!isProductionEnvironment()) {
    return {
      version: "1.0",
      contact: links.mailto.contact,
      policy: POLICY_URLS,
      rules: NON_PRODUCTION_RULE,
    };
  }

  return {
    version: "1.0",
    contact: links.mailto.contact,
    policy: POLICY_URLS,
    references: links.docs,
    rules: PRODUCTION_RULES,
  };
}

export function GET() {
  return new Response(serializeLlmsConfig(llms()), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
