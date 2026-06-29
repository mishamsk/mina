import js from "@eslint/js";
import playwright from "eslint-plugin-playwright";
import reactHooks from "eslint-plugin-react-hooks";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import unusedImports from "eslint-plugin-unused-imports";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist", "playwright-report", "test-results", "src/api/generated"],
  },
  {
    ...js.configs.recommended,
    files: ["**/*.{js,mjs}"],
    languageOptions: {
      ecmaVersion: 2024,
      globals: {
        ...globals.node,
      },
    },
  },
  {
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
    ],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2024,
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "simple-import-sort": simpleImportSort,
      "unused-imports": unusedImports,
    },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/return-await": [
        "error",
        "error-handling-correctness-only",
      ],
      "no-console": [
        "error",
        { allow: ["warn", "error", "group", "groupEnd"] },
      ],
      "simple-import-sort/exports": "error",
      "simple-import-sort/imports": "error",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          vars: "all",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    ...playwright.configs["flat/recommended"],
    files: ["tests/e2e/**/*.ts"],
  },
);
