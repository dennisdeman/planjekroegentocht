import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Live — Plan je Kroegentocht",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

function SWRegister() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `if("serviceWorker"in navigator){navigator.serviceWorker.register("/sw.js").catch(function(){})}`,
      }}
    />
  );
}

export default function LiveLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="live-shell">
      <SWRegister />
      {children}
    </div>
  );
}
