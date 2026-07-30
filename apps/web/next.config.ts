import path from "node:path";
import createMDX from "@next/mdx";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  pageExtensions: ["ts", "tsx", "js", "jsx", "md", "mdx"],
  transpilePackages: ["@4mica/url", "@4mica/ui"],

  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },

  images: {
    unoptimized: true,
  },
};

// Plugins are named as strings, not imported: `@next/mdx` forwards `options`
// to the MDX loader, and under Turbopack (the default in Next 16) loader
// options must be JSON-serializable. Shiki therefore runs at build time only —
// no highlighter ships to the browser, matching `lib/shiki.ts`.
const withMDX = createMDX({
  options: {
    remarkPlugins: [
      ["remark-frontmatter", { type: "yaml", marker: "-" }],
      ["remark-gfm", {}],
    ],
    rehypePlugins: [["@shikijs/rehype", { theme: "vesper" }]],
  },
});

export default withMDX(nextConfig);
