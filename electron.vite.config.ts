import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRootDirectory = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  main: {
    build: {
      externalizeDeps: {
        include: ["electron"],
      },
      outDir: "out/main",
      rollupOptions: {
        external: ["electron"],
        input: {
          index: path.resolve(projectRootDirectory, "src/main/index.ts"),
        },
      },
    },
    resolve: {
      tsconfigPaths: true,
    },
  },
  preload: {
    build: {
      externalizeDeps: {
        include: ["electron"],
      },
      outDir: "out/preload",
      rollupOptions: {
        external: ["electron"],
        input: {
          index: path.resolve(projectRootDirectory, "src/preload/index.ts"),
        },
        output: {
          entryFileNames: "index.cjs",
          format: "cjs",
        },
      },
    },
    resolve: {
      tsconfigPaths: true,
    },
  },
  renderer: {
    base: "./",
    build: {
      outDir: "out/renderer",
    },
    plugins: [react()],
    resolve: {
      tsconfigPaths: true,
    },
    root: "src/renderer",
  },
});
