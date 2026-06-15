import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  transpilePackages: ["@4mica/url"],

  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },

  images: {
    unoptimized: true,
  },
};

export default nextConfig;
