import { useEffect, useMemo } from "react";
import type { GameState } from "@/lib/game/types";
import type { InboxDestination } from "@/lib/game/inboxNavigation";
import {
  delegateManagerRecruitmentPriorities,
  recruitmentDelegationAvailability,
} from "@/lib/game/managerRecruitmentBrief";
import { deskRequestForDestination } from "@/lib/game/transferDesk";
import { TransferDesk } from "./TransferDesk";

/* Transfers root. The old seven-tile menu is gone: Transfers opens straight
   into the Executive Transfer Desk. Inbox and briefing deep links resolve to
   a lens and, where relevant, the exact deal or player inside it. */

type RecruitmentDestination = Extract<InboxDestination, { tab: "recruitment" }>;

export function RecruitmentFlow({
  state,
  update,
  destination,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
  destination?: RecruitmentDestination | null;
}) {
  const initial = useMemo(() => deskRequestForDestination(destination), [destination]);

  // A manager memo ("Assign to Recruitment") hands his priorities to the
  // recruitment department once, then lands on the scouting results.
  const memoEventKey =
    destination?.view === "find" && "memoEventKey" in destination
      ? destination.memoEventKey
      : undefined;
  const memoManager = useMemo(() => {
    if (!memoEventKey) return null;
    if (
      !memoEventKey.startsWith("club-conversation:scouting-focus:") &&
      !memoEventKey.startsWith("club-conversation:keeper-depth:")
    )
      return null;
    return state.hiredStaff.find((staff) => staff.role === "Manager") ?? null;
  }, [memoEventKey, state.hiredStaff]);

  useEffect(() => {
    if (!memoManager || !memoEventKey) return;
    const flag = `recruitmentMemoAssigned:${memoEventKey}`;
    if (state.inboxFlags[flag]) return;
    update((current) => {
      const availability = recruitmentDelegationAvailability(current);
      if (!availability.available) return current;
      const delegated = delegateManagerRecruitmentPriorities(current, memoManager);
      return { ...delegated, inboxFlags: { ...delegated.inboxFlags, [flag]: true } };
    });
  }, [memoManager, memoEventKey, state.inboxFlags, update]);

  return <TransferDesk state={state} update={update} initial={initial} />;
}
