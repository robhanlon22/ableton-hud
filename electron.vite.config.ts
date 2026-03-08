import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tsconfigPaths from "vite-tsconfig-paths";

const projectRootDirectory = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  main: {
    build: {
      outDir: "out/main",
      rollupOptions: {
        input: {
          index: path.resolve(projectRootDirectory, "src/main/index.ts"),
        },
      },
    },
    plugins: [
      tsconfigPaths({
        projects: ["tsconfig.json"],
        root: projectRootDirectory,
      }),
    ],
  },
  preload: {
    build: {
      outDir: "out/preload",
      rollupOptions: {
        input: {
          index: path.resolve(projectRootDirectory, "src/preload/index.ts"),
        },
        output: {
          entryFileNames: "index.cjs",
          format: "cjs",
        },
      },
    },
    plugins: [
      tsconfigPaths({
        projects: ["tsconfig.json"],
        root: projectRootDirectory,
      }),
    ],
  },
  renderer: {
    base: "./",
    build: {
      outDir: "out/renderer",
    },
    plugins: [
      tsconfigPaths({
        projects: ["tsconfig.json"],
        root: projectRootDirectory,
      }),
      react(),
    ],
    root: "src/renderer",
  },
});
