import type { Metadata } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import { AuthSessionProvider } from "@ui/session-provider";
import "./globals.css";

const GA_ID = "G-J2Y0FEHP0S";

const SITE_URL = "https://planjekroegentocht.nl";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Plan je Kroegentocht",
  description: "Organiseer de perfecte kroegentocht — eerlijk schema, geen conflicten. Gratis online tool voor basisscholen, spelverenigingen en bedrijven.",
  applicationName: "Plan je Kroegentocht",
  authors: [{ name: "Eye Catching", url: "https://eyecatching.cloud" }],
  creator: "Eye Catching",
  publisher: "Eye Catching",
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
    shortcut: "/favicon.png",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="nl">
      <body suppressHydrationWarning>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="lazyOnload"
        />
        <Script id="ga-init" strategy="lazyOnload">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_ID}');
          `}
        </Script>
        <AuthSessionProvider>
          {children}
        </AuthSessionProvider>
      </body>
    </html>
  );
}
