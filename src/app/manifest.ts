import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Beacon",
    short_name: "Beacon",
    description:
      "A calm campus mobility coordinator that helps you get home.",
    start_url: "/",
    id: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fbfaf6",
    theme_color: "#fbfaf6",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/beacon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      { src: "/beacon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
