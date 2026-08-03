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

export function NavTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" style={{ display: "flex", gap: "2px" }}>
      {TABS.map(tab => {
        const isActive =
          pathname === tab.href || pathname.startsWith(`${tab.href}/`);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className="nav-tab"
            data-active={isActive ? "true" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
