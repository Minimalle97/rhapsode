"use client";
// components/nav/NavTabs.tsx

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/today",    label: "Today"    },
  { href: "/library",  label: "Library"  },
  { href: "/friends",  label: "Friends"  },
  { href: "/progress", label: "Progress" },
  { href: "/profile",  label: "Profile"  },
];

export interface NavNotices {
  /** Tvekamper som vantar pa ditt svar. */
  invites:  number;
  /** Egna inbjudningar som nyss antagits, annu osedda. */
  accepted: number;
}

/**
 * Bubblorna pa Friends-fliken.
 *
 * Tva farger, for att de kraver olika saker av dig.
 *
 *   Guld  — nagon vantar pa ditt svar. Slocknar nar du svarat.
 *   Gron  — nagon sa ja till DIG, och klockan gar. Slocknar nar du sett
 *           det, inte nar kampen tar slut.
 *
 * Bada samtidigt ar mojligt och ritas som tva bubblor. Att sla ihop dem
 * till en siffra hade dolt att den ena kraver ett svar och den andra
 * bara ar en nyhet.
 */
export function NavTabs({ notices }: { notices?: NavNotices }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="nav-tabs">
      {TABS.map(tab => {
        const isActive =
          pathname === tab.href || pathname.startsWith(`${tab.href}/`);

        const invites  = tab.href === "/friends" ? notices?.invites  ?? 0 : 0;
        const accepted = tab.href === "/friends" ? notices?.accepted ?? 0 : 0;
        const total    = invites + accepted;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className="nav-tab"
            data-active={isActive ? "true" : undefined}
            // Bubblan ar en fargad prick och sager darfor ingenting till
            // en skarmlasare. Etiketten bar innebörden i stallet.
            aria-label={
              total > 0
                ? `${tab.label}, ${[
                    invites  > 0 ? `${invites} duel ${invites === 1 ? "invitation" : "invitations"}` : "",
                    accepted > 0 ? `${accepted} accepted` : "",
                  ].filter(Boolean).join(", ")}`
                : undefined
            }
          >
            {tab.label}
            {invites  > 0 && <span className="nav-dot nav-dot-invite">{invites}</span>}
            {accepted > 0 && <span className="nav-dot nav-dot-accepted">{accepted}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
