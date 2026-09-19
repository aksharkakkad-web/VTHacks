import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SafeCircle",
    short_name: "SafeCircle",
    description:
      "A calm campus mobility coordinator that helps you get home.",
    start_url: "/",
    id: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#eef3f0",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/safecircle-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      { src: "/safecircle-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/safecircle-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
