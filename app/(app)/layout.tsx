"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { NavShell } from "@ui/nav-shell";
import { TrialExpiredOverlay, FrozenBanner } from "@ui/upgrade-modal";

export default function AppLayout({ children }: { children: ReactNode }) {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  const pathname = usePathname();
  const { data: session } = useSession();
  const planState = session?.user?.planState;
  const isUpgradePage = pathname === "/upgrade";

  return (
    <NavShell>
      {planState?.status === "expired" && !isUpgradePage && <TrialExpiredOverlay />}
      {planState?.status === "frozen" && !isUpgradePage && <FrozenBanner />}
      {children}
    </NavShell>
  );
}
