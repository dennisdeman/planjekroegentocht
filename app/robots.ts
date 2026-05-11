import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/functies", "/hoe-het-werkt", "/voor-wie", "/prijzen", "/faq", "/blog", "/over-ons", "/contact"],
        disallow: ["/dashboard", "/configurator", "/planner", "/settings", "/admin", "/help", "/api/"],
      },
    ],
    sitemap: "https://planjekroegentocht.nl/sitemap.xml",
  };
}
