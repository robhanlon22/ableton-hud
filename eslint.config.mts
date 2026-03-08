import type { Linter } from "eslint";

import reactPlugin from "@eslint-react/eslint-plugin";
import { includeIgnoreFile } from "@eslint/compat";
import js from "@eslint/js";
import jsdoc from "eslint-plugin-jsdoc";
import eslintPluginN from "eslint-plugin-n";
import perfectionist from "eslint-plugin-perfectionist";
import regexp from "eslint-plugin-regexp";
import { configs as sonarjsConfigs } from "eslint-plugin-sonarjs";
import tsdoc from "eslint-plugin-tsdoc";
import unicorn from "eslint-plugin-unicorn";
import unusedImports from "eslint-plugin-unused-imports";
import { defineConfig } from "eslint/config";
import globals from "globals";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tseslint from "typescript-eslint";

// eslint-disable-next-line n/no-missing-import -- false positive for the local custom rule module in flat config
import arrangeActAssertRule from "./eslint-rules/arrange-act-assert.js";

const { dirname, resolve } = path;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const gitignorePath = resolve(__dirname, ".gitignore");
const tsconfigPath = resolve(__dirname, "tsconfig.json");
const MAX_COMPLEXITY = 10;
const MAX_DEPTH = 4;
const MAX_FILE_LINES = 400;
const MAX_FUNCTION_LINES = 80;
const MAX_PARAMS = 4;
const codeFiles = ["**/*.{js,mjs,cjs,ts,mts,cts,tsx}"];
const deepRelativeImportPatterns = [
  "../../../*",
  "../../../../*",
  "../../../../../*",
  "../../../../../../*",
  "../../../../../../../*",
];
const typedFiles = ["**/*.{ts,mts,cts,tsx}"];
const jsFiles = ["**/*.{js,mjs,cjs}"];
const lintedTestFiles = ["src/**/*.test.{ts,tsx}", "e2e/**/*.spec.ts"];
const commonJsFiles = ["**/*.cjs"];
const nodeRuntimeFiles = [
  "src/main/**/*.{js,mjs,cjs,ts,mts,cts}",
  "src/preload/**/*.{js,mjs,cjs,ts,mts,cts}",
  "e2e/**/*.ts",
  "scripts/**/*.{js,mjs,cjs,ts,mts,cts}",
  "*.config.{js,mjs,cjs,ts,mts,cts}",
];
const nodeTryExtensions = [
  ".js",
  ".ts",
  ".mjs",
  ".mts",
  ".cjs",
  ".cts",
  ".json",
  ".node",
];
const nodeVersion = ">=22.4.0";
const rendererSourceFiles = ["src/renderer/src/**/*.{ts,tsx}"];
const rendererSourceIgnores = [
  "src/renderer/src/**/*.test.{ts,tsx}",
  "src/renderer/src/**/__tests__/**/*",
  "src/renderer/src/**/*.d.ts",
];

/**
 *
 * @param config - The config fragment to scope.
 * @param files - The file globs that should receive the config.
 * @param ignores - Extra ignore globs to exclude from that scope.
 * @returns The scoped flat-config fragment.
 */
function scopeConfig(
  config: Linter.Config,
  files: string[],
  ignores: string[] = [],
): Linter.Config {
  return {
    ...config,
    files,
    ignores: [...(config.ignores ?? []), ...ignores],
  };
}

export default defineConfig([
  includeIgnoreFile(gitignorePath),
  {
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
  },
  {
    extends: ["js/recommended"],
    files: codeFiles,
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { js },
  },
  jsdoc.configs["flat/recommended-typescript-error"],
  perfectionist.configs["recommended-natural"],
  scopeConfig(sonarjsConfigs.recommended, codeFiles),
  scopeConfig(regexp.configs.recommended, codeFiles),
  scopeConfig(unicorn.configs.recommended, codeFiles),
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  scopeConfig(eslintPluginN.configs["flat/recommended"], nodeRuntimeFiles),
  {
    files: typedFiles,
    plugins: { tsdoc },
    rules: {
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        { assertionStyle: "never" },
      ],
      "@typescript-eslint/no-magic-numbers": [
        "error",
        {
          enforceConst: true,
          ignore: [-1, 0, 1],
          ignoreDefaultValues: true,
          ignoreEnums: true,
          ignoreNumericLiteralTypes: true,
          ignoreReadonlyClassProperties: true,
          ignoreTypeIndexes: true,
        },
      ],
      "tsdoc/syntax": "error",
    },
  },
  {
    files: jsFiles,
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: typedFiles,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      "no-magic-numbers": "off",
    },
  },
  {
    files: commonJsFiles,
    languageOptions: {
      globals: globals.node,
      sourceType: "commonjs",
    },
  },
  {
    files: nodeRuntimeFiles,
    rules: {
      "n/no-missing-import": [
        "error",
        {
          tryExtensions: nodeTryExtensions,
          tsconfigPath,
        },
      ],
      "n/no-unsupported-features/es-syntax": [
        "error",
        { version: nodeVersion },
      ],
      "n/no-unsupported-features/node-builtins": [
        "error",
        { version: nodeVersion },
      ],
    },
    settings: {
      node: {
        tryExtensions: nodeTryExtensions,
        version: nodeVersion,
      },
    },
  },
  {
    files: codeFiles,
    plugins: {
      "unused-imports": unusedImports,
    },
    rules: {
      complexity: ["error", MAX_COMPLEXITY],
      "jsdoc/require-jsdoc": [
        "error",
        {
          checkAllFunctionExpressions: true,
          checkConstructors: true,
          checkGetters: true,
          checkSetters: true,
          contexts: [
            "TSCallSignatureDeclaration",
            "TSConstructSignatureDeclaration",
            "TSIndexSignature",
            "TSInterfaceDeclaration",
            "TSMethodSignature",
            "TSPropertySignature",
            "TSTypeAliasDeclaration",
          ],
          exemptEmptyConstructors: false,
          exemptEmptyFunctions: false,
          require: {
            ArrowFunctionExpression: true,
            ClassDeclaration: true,
            ClassExpression: true,
            FunctionDeclaration: true,
            FunctionExpression: true,
            MethodDefinition: true,
          },
        },
      ],
      "max-depth": ["error", MAX_DEPTH],
      "max-lines": [
        "error",
        {
          max: MAX_FILE_LINES,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
      "max-lines-per-function": [
        "error",
        {
          IIFEs: true,
          max: MAX_FUNCTION_LINES,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
      "max-params": ["error", MAX_PARAMS],
      "no-console": "error",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: deepRelativeImportPatterns,
              message:
                "Use @main, @preload, @renderer, or @shared aliases instead of deep relative imports.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          message:
            "Do not use Reflect; prefer explicit property access, direct assignment, deletion, or typed adapters.",
          selector: "MemberExpression[object.name='Reflect']",
        },
      ],
      "no-warning-comments": "error",
      "unicorn/number-literal-case": [
        "error",
        {
          hexadecimalValue: "lowercase",
        },
      ],
      "unused-imports/no-unused-imports": "error",
    },
  },
  scopeConfig(
    reactPlugin.configs["strict-type-checked"],
    rendererSourceFiles,
    rendererSourceIgnores,
  ),
  scopeConfig(
    reactPlugin.configs.dom,
    rendererSourceFiles,
    rendererSourceIgnores,
  ),
  scopeConfig(
    reactPlugin.configs["web-api"],
    rendererSourceFiles,
    rendererSourceIgnores,
  ),
  {
    files: rendererSourceFiles,
    ignores: rendererSourceIgnores,
    rules: {
      "@eslint-react/no-unused-props": "error",
      "@eslint-react/prefer-destructuring-assignment": "error",
      "@eslint-react/web-api/no-leaked-event-listener": "error",
      "@eslint-react/web-api/no-leaked-interval": "error",
      "@eslint-react/web-api/no-leaked-resize-observer": "error",
      "@eslint-react/web-api/no-leaked-timeout": "error",
    },
  },
  {
    files: lintedTestFiles,
    plugins: {
      "aosc-tests": {
        rules: {
          "arrange-act-assert": arrangeActAssertRule,
        },
      },
    },
    rules: {
      "aosc-tests/arrange-act-assert": "error",
    },
  },
]);
