# Cloud deletion ordering regression — 9 October 2026

P1, release validation blocker until corrected and deployed retested. Network-prohibited client mock reproduction, not production account testing.

On the source underlying b1d12d79 and PR #304, automatic uploads participate in a per-slot queue, but syncAllCareers uploads directly. Hold a manual Sync now insert open, request deleteCloudCareer, then release the insert: deletion runs before the upload finishes and the cloud save can be recreated afterward. A controlled regression failed with actual true / expected false for deletion occurring before upload completion.

The focused fix serializes manual sync, automatic uploads, slot deletion and account deletion through one cloud-operation queue. Authentication is checked when an operation executes. Successful slot deletion advances a revision; already-queued uploads of that old revision return false, and queued manual sync rejects before applying a stale plan. Failed operations do not poison subsequent work. Local careers remain untouched by cloud deletion.

The extended cloud-queue check passes with held manual uploads, ordered deletion, rejection of stale queued manual sync, suppression of stale queued uploads, account deletion waiting for a pending upload, and authentication rechecking after account deletion. Existing signed-out acknowledgment, matching-copy, error recovery and local-preservation checks remain.

No production account was created/deleted and no real-player career was changed. Actual two-account production RLS, live deletion and device conflict tests remain pending explicit authorisation. This source fix does not deploy the public game. Until deployed correction is verified, avoid deleting slots while Sync now is running.
