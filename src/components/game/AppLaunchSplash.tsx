import { useEffect, useState } from "react";

import splashAsset from "@/assets/legacy-football-splash.webp.asset.json";

export function AppLaunchSplash() {
  const [artReady, setArtReady] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const failSafe = window.setTimeout(() => setVisible(false), 3000);
    return () => window.clearTimeout(failSafe);
  }, []);

  useEffect(() => {
    if (!artReady) return;
    const timer = window.setTimeout(() => setVisible(false), 900);
    return () => window.clearTimeout(timer);
  }, [artReady]);

  if (!visible) return null;

  return (
    <div className={`lf-launch-splash${artReady ? " is-ready" : ""}`} aria-hidden="true">
      <img
        src={splashAsset.url}
        alt=""
        className="lf-launch-splash-art"
        onLoad={() => setArtReady(true)}
        onError={() => setVisible(false)}
      />
    </div>
  );
}