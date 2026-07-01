// tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Rhapsode gold theme — kopplade till CSS variables
        bg:     "var(--bg)",
        bg2:    "var(--bg2)",
        bg3:    "var(--bg3)",
        bg4:    "var(--bg4)",
        gold:   "var(--gold)",
        gold2:  "var(--gold2)",
        parch:  "var(--parch)",
        parch2: "var(--parch2)",
        muted:  "var(--muted)",
      },
      fontFamily: {
        display: ["Cormorant Garamond", "Georgia", "serif"],
        body:    ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
