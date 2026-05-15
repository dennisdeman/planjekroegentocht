import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Plan je Kroegentocht",
    short_name: "Kroegentocht",
    description: "Plan je kroegentocht automatisch en draai 'm volledig digitaal: scoreapp, scorebord, programma en chat in één tool.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0E2E50",
    lang: "nl-NL",
    orientation: "portrait",
    icons: [
      {
        src: "/favicon.png",
        sizes: "any",
        type: "image/png",
      },
    ],
  };
}
