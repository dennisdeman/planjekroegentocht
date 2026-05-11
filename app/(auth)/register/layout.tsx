import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Account aanmaken — Plan je Kroegentocht",
  description: "Maak gratis een account aan en probeer Plan je Kroegentocht 7 dagen zonder creditcard.",
  alternates: { canonical: "/register" },
  robots: { index: false, follow: false },
};

export default function RegisterLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
