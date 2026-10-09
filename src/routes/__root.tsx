import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

declare const __LEGACY_FOOTBALL_BUILD_ID__: string;

import appCss from "../styles.css?url";
import presentationCss from "../presentation.css?url";
import homeOverhaulCss from "../home-overhaul.css?url";
import stadiumAtmosphereCss from "../stadium-atmosphere.css?url";
import mastheadPolishCss from "../masthead-polish.css?url";
import inboxOverhaulCss from "../inbox-overhaul.css?url";
import facilitiesGroundCss from "../facilities-ground.css?url";
import homeConceptCss from "../home-concept.css?url";
import newsroomCss from "../newsroom.css?url";
import departmentCss from "../department.css?url";
import transferDeskCss from "../transfer-desk.css?url";
import homeArtCss from "../home-art.css?url";
import funCss from "../fun.css?url";
import mobileDockCss from "../mobile-dock.css?url";
import homeShellPolishCss from "../home-shell-polish.css?url";
import desktopWorkspaceCss from "../desktop-workspace.css?url";
import { installAudioUnlock } from "../lib/audio/soundscape";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { applyLatestBuild, cleanUpdateParams, fetchLatestBuildId } from "../lib/appUpdate";

function NotFoundComponent() {
  const errorMessage =
    error instanceof Response
      ? `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`
      : error instanceof Error
        ? error.message
        : String(error);

  const copyCrashDetails = async () => {
    const details = [
      "Legacy Football crash report",
      `Build: ${__LEGACY_FOOTBALL_BUILD_ID__}`,
      `Route: ${typeof window !== "undefined" ? window.location.pathname : "unknown"}`,
      `Time: ${new Date().toISOString()}`,
      `Error: ${errorMessage}`,
      `Viewport: ${typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : "unknown"}`,
      `User agent: ${typeof navigator !== "undefined" ? navigator.userAgent : "unknown"}`,
      error instanceof Error && error.stack ? `Stack:\n${error.stack}` : null,
    ].filter(Boolean).join("\n");
    try {
      await navigator.clipboard.writeText(details);
      setCopyStatus("Crash details copied.");
    } catch (copyError) {
      setCopyStatus(`Could not copy details: ${(copyError as Error).message}`);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">The page you're looking for doesn't exist or has been moved.</p>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">Go home</Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">Something went wrong on our end. Your saved career is not cleared by this screen. You can try again or head back home.</p>
        <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-left text-xs text-muted-foreground">
          Build {__LEGACY_FOOTBALL_BUILD_ID__.slice(0, 8)} · {errorMessage}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button onClick={() => { router.invalidate(); reset(); }} className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">Try again</button>
          <a href="/" className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent">Go home</a>
          <button onClick={() => void copyCrashDetails()} className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent">Copy crash details</button>
        </div>
        {copyStatus ? <p className="mt-3 text-xs text-muted-foreground">{copyStatus}</p> : null}
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "author", content: "Legacy Football" },
      { name: "application-name", content: "Legacy Football" },
      { name: "theme-color", content: "#073b34" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Legacy Football" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: presentationCss },
      { rel: "stylesheet", href: homeOverhaulCss },
      { rel: "stylesheet", href: stadiumAtmosphereCss },
      { rel: "stylesheet", href: mastheadPolishCss },
      { rel: "stylesheet", href: inboxOverhaulCss },
      { rel: "stylesheet", href: facilitiesGroundCss },
      // Home concept pass: overrides the layers above.
      { rel: "stylesheet", href: homeConceptCss },
      // Chairman's office, newsroom and chairman studio.
      { rel: "stylesheet", href: newsroomCss },
      { rel: "stylesheet", href: departmentCss },
      { rel: "stylesheet", href: transferDeskCss },
      { rel: "stylesheet", href: homeArtCss },
      { rel: "stylesheet", href: funCss },
      // Phones: navigation and Continue share one bottom dock.
      { rel: "stylesheet", href: mobileDockCss },
      { rel: "stylesheet", href: homeShellPolishCss },
      // PC-only composition layer: loaded last so desktop is a workspace, not a scaled mobile layout.
      { rel: "stylesheet", href: desktopWorkspaceCss },
      { rel: "manifest", href: "/manifest.webmanifest?v=3" },
      { rel: "icon", href: "/favicon.ico?v=3", sizes: "any" },
      { rel: "icon", href: "/favicon.png?v=3", type: "image/png", sizes: "64x64" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png?v=3", sizes: "180x180" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&family=Work+Sans:wght@400;500;600;700&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /><meta name="legacy-football-build" content={__LEGACY_FOOTBALL_BUILD_ID__} /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => {
    installAudioUnlock();
    cleanUpdateParams();

    // Installed PWAs can resume an older cached document. Revalidate when the
    // app launches or returns to the foreground and refresh only when the
    // deployed asset fingerprint has changed.
    let lastCheck = 0;
    const checkForFreshBuild = async () => {
      if (document.visibilityState !== "visible" || Date.now() - lastCheck < 30_000) return;
      lastCheck = Date.now();
      try {
        const latestBuild = await fetchLatestBuildId();
        if (latestBuild && latestBuild !== __LEGACY_FOOTBALL_BUILD_ID__) {
          await applyLatestBuild(latestBuild);
        }
      } catch {
        // Offline play remains valid; try again on the next foreground event.
      }
    };
    void checkForFreshBuild();
    document.addEventListener("visibilitychange", checkForFreshBuild);
    window.addEventListener("focus", checkForFreshBuild);
    return () => {
      document.removeEventListener("visibilitychange", checkForFreshBuild);
      window.removeEventListener("focus", checkForFreshBuild);
    };
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}
