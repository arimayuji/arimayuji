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
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated Capacitor native projects — not this tool's business.
    "android/**",
    "ios/**",
    // Vendored third-party plugin source (forked to patch a native method) —
    // its compiled dist/ isn't code this project authors or maintains style on.
    "native-plugins/**",
    // Installed Claude Code skills (design references, generator scripts) —
    // same rationale as native-plugins/ above: third-party tooling this
    // project doesn't author, so its own conventions (plain require() in
    // .cjs scripts, etc.) shouldn't be graded against this project's rules.
    // .claude/skills/** is mostly symlinks into .agents/skills/** (the CLI
    // that manages installed skills keeps the real files there), so both
    // need excluding — ESLint follows the symlink to the real path.
    ".claude/skills/**",
    ".agents/skills/**",
  ]),
]);

export default eslintConfig;
