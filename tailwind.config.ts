import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/renderer/index.html", "./src/renderer/src/**/*.{ts,tsx}"],
  darkMode: "class",
  plugins: [],
  theme: {
    extend: {
      boxShadow: {
        downbeat:
          "0 0 0 1px rgba(159, 216, 109, 0.74), 0 0 36px rgba(159, 216, 109, 0.34)",
        pulse:
          "0 0 0 1px rgba(159, 216, 109, 0.5), 0 0 24px rgba(159, 216, 109, 0.28)",
        warningPulse:
          "0 0 0 1px rgba(255, 106, 106, 0.66), 0 0 36px rgba(255, 106, 106, 0.36)",
      },
      colors: {
        ableton: {
          accent: "#e4b05d",
          bg: "#1c1f26",
          border: "#3a4049",
          muted: "#8f98a3",
          panel: "#2c3139",
          panelAlt: "#232830",
          success: "#9fd86d",
          surface: "#262b33",
          text: "#d4d9df",
          warning: "#ff6a6a",
        },
      },
      fontFamily: {
        mono: ["var(--hud-font-mono)"],
        ui: ["var(--hud-font-ui)"],
      },
    },
  },
};

export default config;
