export default {
  extends: ["stylelint-config-standard"],
  ignoreFiles: [
    "dist/**",
    "playwright-report/**",
    "src/api/generated/**",
    "test-results/**",
  ],
  rules: {
    "at-rule-no-unknown": [
      true,
      {
        ignoreAtRules: [
          "apply",
          "config",
          "custom-variant",
          "plugin",
          "reference",
          "source",
          "theme",
          "utility",
          "variant",
        ],
      },
    ],
    "custom-property-pattern": null,
    "custom-property-empty-line-before": null,
    "hue-degree-notation": null,
    "import-notation": null,
    "lightness-notation": null,
    "rule-empty-line-before": null,
    "selector-class-pattern": null,
    "value-keyword-case": null,
  },
};
