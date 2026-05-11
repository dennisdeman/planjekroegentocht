import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Inloggen — Plan je Kroegentocht",
  description: "Log in op je Plan je Kroegentocht-account om je kroegentocht te plannen, te draaien en te beheren.",
  alternates: { canonical: "/login" },
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
