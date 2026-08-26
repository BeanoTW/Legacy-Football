import { useMemo, useState } from "react";
import { ArrowLeft, Binoculars, CheckCircle2, Handshake } from "lucide-react";
import type { GameState, Position } from "@/lib/game/types";
import {
  askingPrice,
  transferMarket,
  playerName,
  ageOf,
  submitTransferOffer,
} from "@/lib/game/recruitment";
import { scoutingAssignment, scoutingReport, startScouting } from "@/lib/game/scouting";
import { fmtMoney } from "@/lib/game/engine";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const POSITIONS: (Position | "ALL")[] = ["ALL", "GK", "DEF", "MID", "FWD"];

export function ScoutingBrowser({
  state,
  update,
  onBack,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
  onBack: () => void;
}) {
  const [position, setPosition] = useState<Position | "ALL">("ALL");
  const [note, setNote] = useState<string | null>(null);
  const rows = useMemo(
    () =>
      transferMarket(state)
        .filter((entry) => position === "ALL" || entry.player.primaryPosition === position)
        .slice(0, 40),
    [state, position],
  );
  const bid = (playerId: string, fee: number) =>
    update((s) => {
      const result = submitTransferOffer(s, playerId, fee);
      setNote(result.result.reason);
      return result.state;
    });

  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft className="size-4 mr-2" /> Back to transfers
      </Button>
      <div>
        <h1 className="font-display text-3xl">Scout players</h1>
        <p className="text-sm text-muted-foreground mt-1">
          There is no magic overall rating. Send scouts, build knowledge and decide from the
          evidence.
        </p>
      </div>
      {note && <div className="rounded-xl border bg-muted/40 px-4 py-3 text-sm">{note}</div>}
      <div className="flex gap-2 flex-wrap">
        {POSITIONS.map((p) => (
          <button
            key={p}
            onClick={() => setPosition(p)}
            className={cn(
              "px-3 py-2 rounded-xl border text-sm font-semibold",
              position === p ? "bg-primary text-primary-foreground border-primary" : "bg-card",
            )}
          >
            {p}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {rows.map(({ player }) => {
          const assignment = scoutingAssignment(state, player.id);
          const report = scoutingReport(state, player);
          const canBid = report.weeksObserved >= 2;
          return (
            <article key={player.id} className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-display text-xl">{playerName(player)}</span>
                    <span className="text-xs font-bold rounded bg-muted px-2 py-1">
                      {player.primaryPosition}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {ageOf(player, state.season)} years · {player.nationality} ·{" "}
                    {player.preferredFoot} foot
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-display text-2xl">{report.knowledgePct}%</div>
                  <div className="text-xs text-muted-foreground">scouted</div>
                </div>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden mt-4">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${report.knowledgePct}%` }}
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-4">
                {report.attributes.map((attr) => (
                  <div key={attr.key} className="rounded-xl bg-muted/50 p-2">
                    <div className="text-[11px] text-muted-foreground">{attr.label}</div>
                    <div className="font-semibold tabular-nums">
                      {!attr.known
                        ? "?"
                        : attr.exact !== undefined
                          ? attr.exact
                          : `${attr.min}–${attr.max}`}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4 text-sm">
                <span>
                  Value{" "}
                  {report.valueRange
                    ? `${fmtMoney(report.valueRange[0])}–${fmtMoney(report.valueRange[1])}`
                    : "Unknown"}
                </span>
                <span>
                  Wage{" "}
                  {report.wageRange
                    ? `${fmtMoney(report.wageRange[0])}–${fmtMoney(report.wageRange[1])}/wk`
                    : "Unknown"}
                </span>
                <span>Personality {report.personalityKnown ? player.personality : "Unknown"}</span>
              </div>
              <div className="mt-4 flex gap-2 flex-wrap items-center">
                {!assignment ? (
                  <Button onClick={() => update((s) => startScouting(s, player.id))}>
                    <Binoculars className="size-4 mr-2" /> Scout player
                  </Button>
                ) : report.complete ? (
                  <div className="inline-flex items-center text-sm font-semibold text-[color:var(--color-income)]">
                    <CheckCircle2 className="size-4 mr-2" /> Fully scouted
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    <Binoculars className="size-4 inline mr-2" />
                    Scouting in progress · {assignment.weeksObserved} observation weeks
                  </div>
                )}
                {canBid && (
                  <Button
                    variant="secondary"
                    onClick={() => bid(player.id, askingPrice(state, player))}
                  >
                    <Handshake className="size-4 mr-2" /> Make approach
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
