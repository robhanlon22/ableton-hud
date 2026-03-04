import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import { resolve } from "node:path";

export default defineConfig({
  main: {
    build: {
      outDir: "out/main",
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/main/index.ts"),
        },
      },
    },
  },
  preload: {
    build: {
      outDir: "out/preload",
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/preload/index.ts"),
        },
        output: {
          entryFileNames: "index.cjs",
          format: "cjs",
        },
      },
    },
  },
  renderer: {
    base: "./",
    build: {
      outDir: "out/renderer",
    },
    plugins: [react()],
    root: "src/renderer",
  },
});
