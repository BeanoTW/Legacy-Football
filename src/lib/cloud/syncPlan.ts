/** Timestamps cannot establish which of two different careers to discard.
 * Manual sync always asks the player before replacing a differing copy.
 */
export type CareerSyncAction = "none" | "upload" | "download" | "conflict";

export function planCareerSync(input: {
  localExists: boolean;
  cloudExists: boolean;
  localModifiedAt: string | null;
  cloudModifiedAt: string | null;
  identical: boolean;
}): CareerSyncAction {
  if (!input.localExists && !input.cloudExists) return "none";
  if (!input.localExists) return "download";
  if (!input.cloudExists) return "upload";
  if (input.identical) return "none";
  return "conflict";
}

/** Automatic saves may extend only the cloud revision this device last
 * acknowledged. A newer local clock does not authorise replacing another
 * device's progress. The server-side conditional update still guards races.
 */
export function canAutomaticallyReplaceCloud(input: {
  cloudModifiedAt: string;
  acknowledgedCloudAt: string | null;
  localModifiedAt: string;
}): boolean {
  if (!input.acknowledgedCloudAt) return false;
  const cloud = Date.parse(input.cloudModifiedAt);
  const acknowledged = Date.parse(input.acknowledgedCloudAt);
  const local = Date.parse(input.localModifiedAt);
  return (
    Number.isFinite(cloud) &&
    Number.isFinite(acknowledged) &&
    Number.isFinite(local) &&
    cloud === acknowledged &&
    local > cloud
  );
}
