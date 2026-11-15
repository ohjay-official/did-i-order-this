import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "e2e/out/**", "extension/release/**", "probe/**", "coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node, chrome: "readonly" },
    },
    rules: {
      "no-restricted-globals": ["error", { name: "LanguageModel", message: "Use Firebase AI Logic, never the Prompt API directly." }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": ["error", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "smart"],
    },
  },
  {
    files: ["e2e/**", "scripts/**", "**/*.mjs", "**/*.test.ts"],
    rules: { "no-console": "off" },
  },
  {
    // The filming probe may talk to the Prompt API only to warm up Gemini Nano. Product code may not.
    files: ["e2e/**"],
    rules: { "no-restricted-globals": "off" },
  },
);
