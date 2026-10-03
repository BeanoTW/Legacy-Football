import { useEffect, useRef, useState } from "react";

import splashAsset from "@/assets/legacy-football-splash.webp.asset.json";

export function AppLaunchSplash() {
  const [artReady, setArtReady] = useState(false);
  const [visible, setVisible] = useState(true);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const image = imgRef.current;
    if (image?.complete && image.naturalWidth > 0) setArtReady(true);
  }, []);

  // A broken or cached image event must never be able to trap the app behind the splash.
  useEffect(() => {
    const safetyTimer = window.setTimeout(() => setVisible(false), 1500);
    return () => window.clearTimeout(safetyTimer);
  }, []);

  useEffect(() => {
    if (!artReady) return;
    const timer = window.setTimeout(() => setVisible(false), 650);
    return () => window.clearTimeout(timer);
  }, [artReady]);

  if (!visible) return null;

  return (
    <div
      className={`lf-launch-splash${artReady ? " is-ready" : ""}`}
      onClick={() => setVisible(false)}
      role="presentation"
    >
      <img
        ref={imgRef}
        src={splashAsset.url}
        alt=""
        className="lf-launch-splash-art"
        onLoad={() => setArtReady(true)}
        onError={() => setVisible(false)}
      />
    </div>
  );
}
