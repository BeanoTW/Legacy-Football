// Shared "apply update" helper for the installed home-screen app.
// Android home-screen apps keep one long-lived browser process, so a soft
// reload can reuse stale in-memory documents. Purge any cached copies and
// navigate to a fresh, uniquely-addressed entry URL instead.

export interface LatestBuild {
  id: string;
  source: string;
}

function buildIdFromHtml(html: string): string | null {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.querySelector('meta[name="legacy-football-build"]')?.getAttribute("content")?.trim() || null;
}

export async function fetchLatestBuild(): Promise<LatestBuild> {
  // A cache-busting query alone is not enough on some installed Android PWAs:
  // the CDN/app shell can still hand back the document that launched the app.
  // Ask the deployed origin for two independently-addressed documents and only
  // call the app current when we can actually read a build fingerprint.
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const candidates = ["/", "/?lf-origin-check=1"].map((path, index) => {
    const url = new URL(path, window.location.origin);
    url.searchParams.set("lf-update-check", `${nonce}-${index}`);
    return url;
  });

  let lastError: Error | null = null;
  for (const url of candidates) {
    try {
      const response = await fetch(url.toString(), {
        cache: "reload",
        credentials: "same-origin",
        headers: {
          "cache-control": "no-cache, no-store, max-age=0, must-revalidate",
          pragma: "no-cache",
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const id = buildIdFromHtml(await response.text());
      if (id) return { id, source: url.pathname + url.search };
      lastError = new Error("Deployed page did not expose a build fingerprint");
    } catch (error) {
      lastError = error as Error;
    }
  }
  throw lastError ?? new Error("Could not verify the deployed build");
}

export async function fetchLatestBuildId(): Promise<string | null> {
  return (await fetchLatestBuild()).id;
}

export async function applyLatestBuild(buildId: string): Promise<void> {
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.allSettled(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // Cache storage is optional.
  }
  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.allSettled(registrations.map((registration) => registration.unregister()));
    }
  } catch {
    // No workers to clear.
  }
  const target = new URL("/", window.location.origin);
  target.searchParams.set("lf-build", buildId);
  target.searchParams.set("lf-refresh", Date.now().toString());
  window.location.replace(target.toString());
}

/** Remove update-only query params once the fresh app has loaded. */
export function cleanUpdateParams(): void {
  const url = new URL(window.location.href);
  let changed = false;
  for (const key of ["lf-build", "lf-refresh", "lf-update-check", "lf-origin-check"]) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  if (changed) window.history.replaceState(window.history.state, "", url.toString());
}
