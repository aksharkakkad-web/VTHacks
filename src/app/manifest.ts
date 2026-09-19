import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SafeCircle",
    short_name: "SafeCircle",
    description:
      "A calm campus mobility coordinator that helps you get home.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#eef3f0",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
