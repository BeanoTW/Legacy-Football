import { strict as assert } from "node:assert";
import { clearGame, loadGame, newGame, saveGame, saveStore } from "../engine";

// Exercise the public engine queue with its in-memory record backend. These
// checks prove operation ordering, not deployed browser/device persistence.
function fence() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

const fresh = newGame("Queue Test FC", "Release Auditor", "SAVE|QUEUE|FIXED");
const newer = { ...structuredClone(fresh), cash: fresh.cash + 123 };
const originalSave = saveStore.save.bind(saveStore);

// Hold the older write inside storage while a newer snapshot is enqueued.
{
  const entered = fence();
  const finish = fence();
  const order: string[] = [];
  let calls = 0;
  saveStore.save = async (state) => {
    const call = ++calls;
    order.push(`start-${call}`);
    if (call === 1) { entered.release(); await finish.promise; }
    const result = await originalSave(state);
    order.push(`end-${call}`);
    return result;
  };
  try {
    const olderWrite = saveGame(fresh);
    await entered.promise;
    const newerWrite = saveGame(newer);
    finish.release();
    await Promise.all([olderWrite, newerWrite]);
    assert.deepEqual(order, ["start-1", "end-1", "start-2", "end-2"]);
    assert.equal((await loadGame())?.cash, newer.cash);
  } finally { finish.release(); saveStore.save = originalSave; }
}

// A deletion queued during a slow write must be last, leaving an empty slot.
{
  const entered = fence();
  const finish = fence();
  saveStore.save = async (state) => {
    entered.release();
    await finish.promise;
    return originalSave(state);
  };
  try {
    const write = saveGame(fresh);
    await entered.promise;
    const deletion = clearGame();
    finish.release();
    await Promise.all([write, deletion]);
    assert.equal(await loadGame(), null, "pending write must not resurrect a cleared slot");
  } finally { finish.release(); saveStore.save = originalSave; }
}

// One rejected write must neither claim success nor poison the next save.
{
  let calls = 0;
  saveStore.save = async (state) => ++calls === 1
    ? [{ level: "error", code: "save/write-failed", detail: "Injected quota failure" }]
    : originalSave(state);
  try {
    const failure = assert.rejects(saveGame(fresh), /Injected quota failure/);
    const recovery = saveGame(newer);
    await Promise.all([failure, recovery]);
    assert.equal((await loadGame())?.cash, newer.cash);
  } finally { saveStore.save = originalSave; }
}

// The three public save slots keep independent snapshots and deletion state.
{
  const third = { ...structuredClone(fresh), cash: fresh.cash + 456 };
  await Promise.all([saveGame(fresh, "slot-1"), saveGame(newer, "slot-2"), saveGame(third, "slot-3")]);
  await clearGame("slot-2");
  assert.equal((await loadGame("slot-1"))?.cash, fresh.cash);
  assert.equal(await loadGame("slot-2"), null);
  assert.equal((await loadGame("slot-3"))?.cash, third.cash);
}

console.log("save-queue: PASS (rapid writes, delete ordering, failed-write recovery, slot isolation)");
