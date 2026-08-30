// app/legal/layout.tsx
//
// Juridiska sidor, utanfor (app)-gruppen med flit.
//
// De maste ga att lasa INNAN man skapar ett konto — dels for att Stripe
// kraver att villkoren ar oppna, dels for att det vore orimligt att
// begara att nagon registrerar sig for att fa veta vad de gar med pa.
// Darfor ligger de ocksa i proxy.ts lista over oppna vagar.

import Link from "next/link";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)" }}>
      <header style={{
        borderBottom: "1px solid var(--bord)",
        padding: "0 20px", height: "58px",
        display: "flex", alignItems: "center", gap: "18px",
      }}>
        <Link href="/" className="brand" style={{ textDecoration: "none" }}>
          Rhap<span>sode</span>
        </Link>
        <nav style={{ display: "flex", gap: "14px", marginLeft: "auto" }}>
          <Link href="/legal/terms" style={navLink}>Terms</Link>
          <Link href="/legal/privacy" style={navLink}>Privacy</Link>
        </nav>
      </header>

      <main style={{ maxWidth: "720px", margin: "0 auto", padding: "48px 24px 100px" }}>
        {children}
      </main>
    </div>
  );
}

const navLink: React.CSSProperties = {
  fontSize: "13px", color: "var(--muted)", textDecoration: "none",
};
