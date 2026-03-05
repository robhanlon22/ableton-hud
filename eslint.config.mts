import type { Rule } from "eslint";

import { includeIgnoreFile } from "@eslint/compat";
import js from "@eslint/js";
import jsdoc from "eslint-plugin-jsdoc";
import perfectionist from "eslint-plugin-perfectionist";
import tsdoc from "eslint-plugin-tsdoc";
import { defineConfig } from "eslint/config";
import globals from "globals";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tseslint from "typescript-eslint";

// @ts-expect-error local eslint rule is authored in JS without TS declarations
import arrangeActAssertRule from "./eslint-rules/arrange-act-assert.mjs";

const typedArrangeActAssertRule = arrangeActAssertRule as Rule.RuleModule;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const gitignorePath = resolve(__dirname, ".gitignore");

export default defineConfig([
  includeIgnoreFile(gitignorePath),
  {
    extends: ["js/recommended"],
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,tsx}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { js },
  },
  jsdoc.configs["flat/recommended-typescript-error"],
  perfectionist.configs["recommended-natural"],
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    files: ["**/*.{ts,mts,cts,tsx}"],
    plugins: { tsdoc },
    rules: { "tsdoc/syntax": "error" },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ["**/*.{ts,mts,cts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["src/**/*.test.{ts,tsx}", "e2e/**/*.spec.ts"],
    plugins: {
      "aosc-tests": {
        rules: {
          "arrange-act-assert": typedArrangeActAssertRule,
        },
      },
    },
    rules: {
      "aosc-tests/arrange-act-assert": "error",
    },
  },
]);
