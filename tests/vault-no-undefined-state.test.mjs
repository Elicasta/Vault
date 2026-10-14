import test from "node:test";
import assert from "node:assert/strict";
import { ESLint } from "eslint";

const viewFiles = [
  "components/vault-v2/VaultV2.jsx",
  "components/vault-v2/DetailDrawer.jsx",
  "components/vault-v2/AddMediaSheet.jsx",
];

test("Critical Vault screens never reference undefined state, including Settings", async () => {
  // The production transpiler does not detect undefined client-side identifiers:
  // both mobile-browser state and hiddenItems previously crashed at runtime.
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [{
      files: ["**/*.jsx"],
      languageOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        parserOptions: { ecmaFeatures: { jsx: true } },
        globals: Object.fromEntries([
          "window", "document", "navigator", "URL", "URLSearchParams", "fetch",
          "FormData", "AbortController", "Image", "localStorage", "sessionStorage",
          "process", "setTimeout", "clearTimeout", "setInterval", "clearInterval",
          "console", "HTMLElement", "CustomEvent", "MutationObserver",
          "IntersectionObserver", "alert", "requestAnimationFrame",
          "cancelAnimationFrame", "FileReader",
        ].map(name => [name, "readonly"])),
      },
      rules: { "no-undef": "error" },
    }],
  });
  const results = await eslint.lintFiles(viewFiles);
  const issues = results.flatMap(result => result.messages
    .filter(message => message.ruleId === "no-undef")
    .map(message => `${result.filePath.split("/").slice(-2).join("/")}: ${message.line} ${message.message}`));
  assert.deepEqual(issues, []);
});
