import js from "@eslint/js";
import playwright from "eslint-plugin-playwright";
import reactHooks from "eslint-plugin-react-hooks";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import unusedImports from "eslint-plugin-unused-imports";
import globals from "globals";
import tseslint from "typescript-eslint";

// Package-boundary import rules from docs/frontend-architecture.md.
// `pkg` builds gitignore-style groups that match both the `@/` alias form and
// relative-path escapes (`../store`, `../../features/...`) for a src package.
const pkg = (dir) => [`@/${dir}`, `@/${dir}/**`, `**/${dir}`, `**/${dir}/**`];
const pkgs = (dirs) => dirs.flatMap(pkg);

// Generated REST client runtime imports are only legal inside src/api.
const generatedGroup = {
  group: [
    "@/api/generated",
    "@/api/generated/**",
    "**/api/generated",
    "**/api/generated/**",
  ],
  allowTypeImports: true,
  message:
    "Import generated REST code only through src/api entry points; elsewhere type-only imports are allowed (docs/frontend-architecture.md REST Data Access).",
};
const configuredGeneratedImportMessage =
  "Import generated REST runtime code through generated-access so the configured browser client is installed first.";
const configuredApiEntryPointMessage =
  "Use configured API entry points from src/api for browser REST requests.";
const generatedDynamicImportSelector =
  "ImportExpression[source.value=/^(?:@\\/api\\/generated|(?:\\.\\.?\\/)+api\\/generated)(?:\\/|$)/]";
const generatedDynamicTemplateImportSelector =
  "ImportExpression > TemplateLiteral[expressions.length=0] > TemplateElement[value.cooked=/^(?:@\\/api\\/generated|(?:\\.\\.?\\/)+api\\/generated)(?:\\/|$)/]";
const apiGeneratedDynamicImportSelector =
  "ImportExpression[source.value=/^(?:@\\/api\\/generated|(?:\\.\\.?\\/)+(?:api\\/)?generated)(?:\\/|$)/]";
const apiGeneratedDynamicTemplateImportSelector =
  "ImportExpression > TemplateLiteral[expressions.length=0] > TemplateElement[value.cooked=/^(?:@\\/api\\/generated|(?:\\.\\.?\\/)+(?:api\\/)?generated)(?:\\/|$)/]";
const apiBoundaryGroup = {
  group: pkgs(["features", "pages", "components", "store", "hooks"]),
  message:
    "api/ owns generated-client setup and entry points: no imports from features, pages, components, store, or hooks (docs/frontend-architecture.md Package Boundaries).",
};

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
    files: ["src/components/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: pkgs([
                "api",
                "features",
                "pages",
                "store",
                "services",
                "models",
              ]),
              message:
                "components/ stays generic/presentational: no imports from api, features, pages, store, services, or models (docs/frontend-architecture.md Package Boundaries).",
            },
            generatedGroup,
          ],
        },
      ],
    },
  },
  {
    files: ["src/utils/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react",
              allowTypeImports: true,
              message:
                "utils/ stays pure: no react runtime import; type-only imports are allowed (docs/frontend-architecture.md Package Boundaries).",
            },
            {
              name: "react-dom",
              allowTypeImports: true,
              message:
                "utils/ stays pure: no react-dom runtime import (docs/frontend-architecture.md Package Boundaries).",
            },
          ],
          patterns: [
            {
              group: ["zustand", "zustand/**"],
              allowTypeImports: true,
              message:
                "utils/ stays pure: no zustand runtime import (docs/frontend-architecture.md Package Boundaries).",
            },
            {
              group: pkgs([
                "api",
                "store",
                "services",
                "features",
                "pages",
                "components",
                "hooks",
              ]),
              message:
                "utils/ stays pure: no imports from api, store, services, features, pages, components, or hooks (docs/frontend-architecture.md Package Boundaries).",
            },
            generatedGroup,
          ],
        },
      ],
    },
  },
  {
    files: ["src/hooks/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: pkgs([
                "api",
                "features",
                "pages",
                "store",
                "services",
                "models",
              ]),
              message:
                "hooks/ stays generic and reusable: no imports from api, features, pages, store, services, or models (docs/frontend-architecture.md Package Boundaries).",
            },
            generatedGroup,
          ],
        },
      ],
    },
  },
  {
    files: ["src/lib/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: pkgs([
                "api",
                "components",
                "features",
                "hooks",
                "models",
                "pages",
                "services",
                "store",
                "utils",
              ]),
              message:
                "lib/ is bottom-of-stack support: no imports from any other src package (docs/frontend-architecture.md Package Boundaries).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/models/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react",
              allowTypeImports: true,
              message:
                "models/ stays data-focused: no react runtime import; type-only imports are allowed (docs/frontend-architecture.md Package Boundaries).",
            },
          ],
          patterns: [
            {
              group: pkgs([
                "features",
                "pages",
                "store",
                "services",
                "components",
                "hooks",
              ]),
              message:
                "models/ stays data-focused: no imports from features, pages, store, services, components, or hooks (docs/frontend-architecture.md Package Boundaries).",
            },
            generatedGroup,
          ],
        },
      ],
    },
  },
  {
    files: ["src/services/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react",
              allowTypeImports: true,
              message:
                "services/ are browser side-effect adapters usable outside React: no react runtime import; type-only imports are allowed (docs/frontend-architecture.md Package Boundaries).",
            },
          ],
          patterns: [
            {
              group: pkgs(["features", "pages", "components", "store"]),
              message:
                "services/ are browser side-effect adapters: no imports from features, pages, components, or store (docs/frontend-architecture.md Package Boundaries).",
            },
            generatedGroup,
          ],
        },
      ],
    },
  },
  {
    files: ["src/store/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: pkgs(["features", "pages", "components"]),
              message:
                "store/ holds UI state below features: no imports from features, pages, or components (docs/frontend-architecture.md Package Boundaries).",
            },
            generatedGroup,
          ],
        },
      ],
    },
  },
  {
    files: ["src/api/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [apiBoundaryGroup],
        },
      ],
    },
  },
  {
    files: ["src/api/**/*.{ts,tsx}"],
    ignores: ["src/api/client.ts", "src/api/generated-access.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            apiBoundaryGroup,
            {
              group: [
                "./generated",
                "./generated/**",
                "@/api/generated",
                "@/api/generated/**",
                "**/api/generated",
                "**/api/generated/**",
                "**/generated",
                "**/generated/**",
              ],
              allowTypeImports: true,
              message: configuredGeneratedImportMessage,
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: apiGeneratedDynamicImportSelector,
          message: configuredGeneratedImportMessage,
        },
        {
          selector: apiGeneratedDynamicTemplateImportSelector,
          message: configuredGeneratedImportMessage,
        },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/api/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: generatedDynamicImportSelector,
          message:
            "Import generated REST code only through src/api entry points (docs/frontend-architecture.md REST Data Access).",
        },
        {
          selector: generatedDynamicTemplateImportSelector,
          message:
            "Import generated REST code only through src/api entry points (docs/frontend-architecture.md REST Data Access).",
        },
      ],
    },
  },
  {
    files: ["src/**/*.{js,mjs}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/api/generated",
                "@/api/generated/**",
                "**/api/generated",
                "**/api/generated/**",
                "**/generated",
                "**/generated/**",
              ],
              message: configuredGeneratedImportMessage,
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: apiGeneratedDynamicImportSelector,
          message: configuredGeneratedImportMessage,
        },
        {
          selector: apiGeneratedDynamicTemplateImportSelector,
          message: configuredGeneratedImportMessage,
        },
      ],
    },
  },
  {
    files: ["src/**/*.{js,mjs,ts,tsx}"],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "fetch",
          message: configuredApiEntryPointMessage,
        },
        {
          name: "XMLHttpRequest",
          message: configuredApiEntryPointMessage,
        },
      ],
      "no-restricted-properties": [
        "error",
        {
          property: "fetch",
          message: configuredApiEntryPointMessage,
        },
        {
          property: "XMLHttpRequest",
          message: configuredApiEntryPointMessage,
        },
        {
          property: "sendBeacon",
          message: configuredApiEntryPointMessage,
        },
      ],
    },
  },
  {
    files: ["src/features/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: pkg("pages"),
              message:
                "features/ sit below route screens: no imports from pages (docs/frontend-architecture.md Package Boundaries).",
            },
            generatedGroup,
          ],
        },
      ],
    },
  },
  {
    files: ["src/pages/**/*.{ts,tsx}", "src/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [generatedGroup],
        },
      ],
    },
  },
  {
    ...playwright.configs["flat/recommended"],
    files: ["tests/e2e/**/*.ts"],
  },
);
