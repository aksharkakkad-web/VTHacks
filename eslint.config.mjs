import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-beacon/**",
    ".next-beacon-dev/**",
    ".next-browser-backend/**",
    ".next-gallery-check/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Independent Remotion asset project has its own dependency/config boundary.
    "videos/beacon-splash-remotion/**",
  ]),
]);

export default eslintConfig;
