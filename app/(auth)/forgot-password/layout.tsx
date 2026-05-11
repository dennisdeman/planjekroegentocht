import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Wachtwoord vergeten — Plan je Kroegentocht",
  description: "Wachtwoord vergeten? Vraag een reset-link aan via je e-mailadres.",
  alternates: { canonical: "/forgot-password" },
  robots: { index: false, follow: false },
};

export default function ForgotPasswordLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
