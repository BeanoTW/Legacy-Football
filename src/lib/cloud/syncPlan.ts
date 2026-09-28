/** Pure, conservative merge decision for one career slot.
 * An untracked local save beside a different cloud save is a conflict, not
 * permission to replace either copy based on an invented timestamp.
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
  if (!input.localModifiedAt || !input.cloudModifiedAt) return "conflict";
  const local = Date.parse(input.localModifiedAt);
  const cloud = Date.parse(input.cloudModifiedAt);
  if (!Number.isFinite(local) || !Number.isFinite(cloud) || local === cloud) return "conflict";
  return local > cloud ? "upload" : "download";
}
