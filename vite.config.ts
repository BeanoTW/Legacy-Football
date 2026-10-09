// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const BUILD_ID = process.env.GITHUB_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.CF_PAGES_COMMIT_SHA ?? process.env.COMMIT_REF ?? new Date().toISOString();
const RELEASE_VERSION = process.env.LEGACY_FOOTBALL_RELEASE_VERSION ?? "Development";
const RELEASE_CHANNEL = process.env.LEGACY_FOOTBALL_RELEASE_CHANNEL ?? "development";

export default defineConfig({
  vite: {
    define: {
      __LEGACY_FOOTBALL_BUILD_ID__: JSON.stringify(BUILD_ID),
      __LEGACY_FOOTBALL_RELEASE_VERSION__: JSON.stringify(RELEASE_VERSION),
      __LEGACY_FOOTBALL_RELEASE_CHANNEL__: JSON.stringify(RELEASE_CHANNEL),
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
