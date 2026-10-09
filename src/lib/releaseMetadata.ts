declare const __LEGACY_FOOTBALL_BUILD_ID__: string;
declare const __LEGACY_FOOTBALL_RELEASE_VERSION__: string;
declare const __LEGACY_FOOTBALL_RELEASE_CHANNEL__: string;

export type ReleaseChannel = "development" | "beta" | "rc" | "stable" | string;

export interface ReleaseMetadata {
  version: string;
  channel: ReleaseChannel;
  buildId: string;
}

export function releaseMetadata(): ReleaseMetadata {
  return {
    version: __LEGACY_FOOTBALL_RELEASE_VERSION__,
    channel: __LEGACY_FOOTBALL_RELEASE_CHANNEL__,
    buildId: __LEGACY_FOOTBALL_BUILD_ID__,
  };
}

export function releaseLabel(meta: ReleaseMetadata = releaseMetadata()): string {
  if (meta.channel === "development") return "Development";
  if (meta.channel === "stable") return meta.version;
  return `${meta.version} · ${meta.channel.toUpperCase()}`;
}
