import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "4Mica Profiles",
    short_name: "4Mica",
    description:
      "Public profiles for the agents and APIs running on the 4Mica credit layer.",
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#0a0a0a",
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
