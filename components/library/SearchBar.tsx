"use client";
// components/library/SearchBar.tsx
// Fas 5: debounced fritextsök på titel/författare.
// Skriver ?q= till URL:en (300ms debounce) — biblioteksidan läser om
// från servern via Next.js router och hämtar filtrerade verk.

import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

export function SearchBar() {
  const router       = useRouter();
  const pathname      = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get("q") ?? "");

  useEffect(() => {
    const handle = setTimeout(() => {
      const params  = new URLSearchParams(searchParams.toString());
      const trimmed = value.trim();
      if (trimmed) params.set("q", trimmed);
      else params.delete("q");

      const next    = `${pathname}?${params.toString()}`;
      const current = `${pathname}?${searchParams.toString()}`;
      if (next !== current) router.push(next, { scroll: false });
    }, 300);

    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div style={{ position: "relative", flex: 1, minWidth: "200px" }}>
      <span
        style={{
          position:  "absolute",
          left:      "12px",
          top:       "50%",
          transform: "translateY(-50%)",
          color:     "var(--muted)",
          fontSize:  "13px",
          pointerEvents: "none",
        }}
      >
        ⌕
      </span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search title or author…"
        style={{
          width:        "100%",
          background:   "var(--bg3)",
          border:       "1px solid var(--bord)",
          borderRadius: "var(--r2)",
          padding:      "9px 12px 9px 30px",
          fontSize:     "13px",
          color:        "var(--parch)",
          outline:      "none",
          fontFamily:   "var(--fb)",
        }}
      />
    </div>
  );
}
