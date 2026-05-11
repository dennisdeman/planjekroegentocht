import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-layout">
      <div className="auth-card-wrapper">{children}</div>
      <p className="auth-footer">&copy; {new Date().getFullYear()} Plan je Kroegentocht</p>
    </div>
  );
}
