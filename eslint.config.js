// @ts-check

const tseslint = require("typescript-eslint");
const eslint = require("@eslint/js");

module.exports = tseslint.config(
  {
    ignores: ["node_modules/**", "client/node_modules/**", "client/out/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      semi: "warn",
      curly: "warn",
      eqeqeq: "warn",
      "prefer-const": "warn",
      "no-var": "warn",
      "no-case-declarations": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-non-null-assertion": "warn",
    },
  },
);
