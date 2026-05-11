"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, type ReactNode } from "react";

const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/functies", label: "Functies" },
  { href: "/hoe-het-werkt", label: "Hoe het werkt" },
  { href: "/voor-wie", label: "Voor wie" },
  { href: "/prijzen", label: "Prijzen" },
  { href: "/faq", label: "FAQ" },
  { href: "/over-ons", label: "Over ons" },
  { href: "/contact", label: "Contact" },
];

export default function PublicLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  return (
    <div className="pub-shell">
      <header className="pub-header">
        <Link href="/" className="pub-brand">
          <Image
            src="/logo-horizontaal.jpg"
            alt="Plan je Kroegentocht"
            width={600}
            height={139}
            priority
            sizes="(max-width: 768px) 156px, 207px"
            className="pub-brand-logo"
          />
        </Link>
        <nav className={`pub-nav ${menuOpen ? "pub-nav-open" : ""}`}>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`pub-nav-link ${pathname === item.href ? "pub-nav-active" : ""}`}
            >
              {item.label}
            </Link>
          ))}
          <div className="pub-nav-auth-mobile">
            <Link href="/login" className="pub-nav-link">Inloggen</Link>
            <Link href="/register" className="button-link btn-primary">Gratis beginnen</Link>
          </div>
        </nav>
        <div className="pub-auth">
          <Link href="/login" className="pub-nav-link">Inloggen</Link>
          <Link href="/register" className="button-link btn-primary">Gratis beginnen</Link>
        </div>
        <button
          className="pub-hamburger"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? "Menu sluiten" : "Menu openen"}
        >
          <span className={`hamburger-icon ${menuOpen ? "open" : ""}`} />
        </button>
      </header>

      <main>{children}</main>

      <footer className="pub-footer">
        <div className="pub-footer-inner">
          <div className="pub-footer-col">
            <Image
              src="/logo-horizontaal.jpg"
              alt="Plan je Kroegentocht"
              width={600}
              height={139}
              sizes="156px"
              className="pub-footer-logo"
            />
            <p>Plan je kroegentocht &mdash; voor scholen, clubs en bedrijven</p>
          </div>
          <div className="pub-footer-col">
            <h4>Product</h4>
            <Link href="/functies">Functies</Link>
            <Link href="/hoe-het-werkt">Hoe het werkt</Link>
            <Link href="/voor-wie">Voor wie</Link>
            <Link href="/prijzen">Prijzen</Link>
            <Link href="/faq">FAQ</Link>
            <Link href="/blog">Blog</Link>
            <Link href="/over-ons">Over ons</Link>
            <Link href="/contact">Contact</Link>
          </div>
          <div className="pub-footer-col">
            <h4>Account</h4>
            <Link href="/login">Inloggen</Link>
            <Link href="/register">Registreren</Link>
          </div>
          <div className="pub-footer-col">
            <h4>Contact</h4>
            <a href="mailto:support@planjekroegentocht.nl">support@planjekroegentocht.nl</a>
            <p style={{ marginTop: 8 }}>
              Een product van{" "}
              <a href="https://eyecatching.cloud" target="_blank" rel="noopener noreferrer">
                Eye Catching
              </a>
            </p>
          </div>
        </div>
        <div className="pub-footer-bottom">
          &copy; {new Date().getFullYear()} Plan je Kroegentocht &mdash; ontwikkeld door Eye Catching
        </div>
      </footer>
    </div>
  );
}
