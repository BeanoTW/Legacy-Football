// Shared "apply update" helper for the installed home-screen app.
// Android home-screen apps keep one long-lived browser process, so a soft
// reload can reuse stale in-memory documents. Purge any cached copies and
// navigate to a fresh, uniquely-addressed entry URL instead.

export async function fetchLatestBuildId(): Promise<string | null> {
  const url = new URL("/", window.location.origin);
  url.searchParams.set("lf-update-check", Date.now().toString());
  const response = await fetch(url.toString(), {
    cache: "no-store",
    headers: { "cache-control": "no-cache, no-store, max-age=0", pragma: "no-cache" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.querySelector('meta[name="legacy-football-build"]')?.getAttribute("content") ?? null;
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
  for (const key of ["lf-build", "lf-refresh", "lf-update-check"]) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  if (changed) window.history.replaceState(window.history.state, "", url.toString());
}
