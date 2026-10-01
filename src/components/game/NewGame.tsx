import { useEffect, useState } from "react";
import { Pencil, Play, Shield, Shirt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TopBar } from "./shared/primitives";
import type { SaveSlotId, SaveSlotSummary } from "@/lib/game/engine";
import { cn } from "@/lib/utils";
import { STARTING_REGIONAL_DIVISIONS } from "@/lib/game/worldPyramid";
import { leaguePresentationName } from "@/lib/game/clubPresentation";
import { saveChairmanProfile } from "@/lib/game/chairmanProfile";
import { ChairmanPortrait } from "./ChairmanPortrait";
import { ChairmanStudio, useChairmanProfile } from "./ChairmanStudio";
import { ClubIdentitySetupSheet } from "./ClubIdentityStudio";
import { ClubBadge, ClubShirt } from "./ClubKitArt";
import { defaultClubKit, type ClubKitState } from "@/lib/game/clubKit";
import { cleanClubNickname } from "@/lib/game/character";

export function NewGame({ onStart, activeSlot, slots, onSelectSlot }: { onStart: (club: string, manager: string, startingDivisionId?: string, clubKit?: ClubKitState, clubNickname?: string) => void; activeSlot: SaveSlotId; slots: SaveSlotSummary[]; onSelectSlot: (slot: SaveSlotId) => void }) {
  const profile = useChairmanProfile();
  const [club, setClub] = useState("Dalton Town");
  const [nickname, setNickname] = useState("");
  const [clubKit, setClubKit] = useState<ClubKitState>(() => defaultClubKit("Dalton Town"));
  const [clubIdentityOpen, setClubIdentityOpen] = useState(false);
  const [clubIdentityTouched, setClubIdentityTouched] = useState(false);
  const [manager, setManager] = useState(profile.name);
  const [studioOpen, setStudioOpen] = useState(false);
  const activeSlotUnreadable = slots.some((slot) => slot.id === activeSlot && slot.status === "unreadable");
  const [startingDivisionId, setStartingDivisionId] = useState(
    STARTING_REGIONAL_DIVISIONS[0]?.id ?? "regional-premier-central",
  );

  // The saved chairman follows the player into every new career; edits made
  // in the studio flow straight back into the name field.
  useEffect(() => {
    setManager(profile.name);
  }, [profile.name]);

  const start = () => {
    if (activeSlotUnreadable) return;
    const name = manager.trim() || "Chairman";
    saveChairmanProfile({ ...profile, name });
    onStart(club.trim(), name, startingDivisionId, clubKit, cleanClubNickname(nickname).trim());
  };

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background">
      <TopBar title="Legacy Football" subtitle="Build a club legacy from non-league to the top" />
      <div data-testid="new-career-scroll" className="min-h-0 w-full flex-1 overflow-y-auto overscroll-contain [touch-action:pan-y] [-webkit-overflow-scrolling:touch]">
      <div className="mx-auto max-w-xl px-3 py-4 pb-6 sm:px-4 sm:py-8">
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="banner-strip px-4 py-2 text-sm">New Club Setup</div>
          <div className="space-y-4 p-4 sm:p-6">
            <div className="grid grid-cols-3 gap-2">
              {slots.map(({ id, state, status }, index) => (
                <button
                  key={id}
                  onClick={() => onSelectSlot(id)}
                  className={cn(
                    "rounded-xl border-2 border-border bg-muted/60 p-2 text-left text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                    id === activeSlot && "border-primary bg-primary/15",
                  )}
                >
                  <span className="block text-[10px] font-bold uppercase text-muted-foreground">Career {index + 1}</span>
                  <span className="block truncate text-xs font-semibold">{status === "unreadable" ? "Save needs recovery" : state?.clubName ?? "Empty"}</span>
                </button>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              You take over a semi-professional club at Football Level 7 with £220,000 in the bank.
              Shape the squad, control the wage bill, invest in the ground and build your way up the pyramid.
            </p>

            <div className="lf-newgame-chairman">
              <button type="button" className="lf-office-portrait" onClick={() => setStudioOpen(true)} aria-label="Edit the chairman's look">
                <ChairmanPortrait avatar={profile.avatar} size={76} />
                <span className="lf-office-edit"><Pencil /></span>
              </button>
              <div className="min-w-0 flex-1 space-y-2">
                <Label htmlFor="mgr">Chairman name</Label>
                <Input id="mgr" value={manager} maxLength={40} onChange={(e) => setManager(e.target.value)} className="border-2 border-border bg-muted/65 text-foreground placeholder:text-muted-foreground" />
                <button type="button" className="lf-newgame-edit-look" onClick={() => setStudioOpen(true)}>
                  <Pencil /> Edit look
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="club">Club name</Label>
              <Input
                id="club"
                value={club}
                onChange={(e) => {
                  const next = e.target.value;
                  setClub(next);
                  if (!clubIdentityTouched) setClubKit(defaultClubKit(next || "New Club"));
                }}
                className="border-2 border-border bg-muted/65 text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nickname">Club nickname</Label>
              <Input
                id="nickname"
                value={nickname}
                maxLength={28}
                onChange={(e) => setNickname(cleanClubNickname(e.target.value))}
                placeholder="e.g. The Railwaymen"
                className="border-2 border-border bg-muted/65 text-foreground placeholder:text-muted-foreground"
              />
              <p className="text-[10px] text-muted-foreground">Leave blank and the game will generate one.</p>
            </div>

            <section className="overflow-hidden rounded-xl border-2 border-border bg-muted/35">
              <div className="flex items-center justify-between gap-3 px-3 py-2">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Shield className="size-4 text-primary" /> Club identity
                  </div>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">Badge, home kit, away kit, colours, sponsor and club details.</p>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={() => setClubIdentityOpen(true)}>
                  <Pencil className="size-3.5" /> Design club
                </Button>
              </div>
              <div className="grid grid-cols-[72px_1fr_1fr] items-center gap-2 border-t px-3 py-3">
                <div className="flex justify-center">
                  <ClubBadge design={clubKit.badge} clubName={club || "New Club"} size={56} />
                </div>
                <div className="rounded-lg bg-background/65 p-2 text-center">
                  <ClubShirt kit={clubKit.home} badge={clubKit.badge} clubName={club || "New Club"} size={58} />
                  <span className="mt-1 flex items-center justify-center gap-1 text-[9px] font-semibold text-muted-foreground"><Shirt className="size-3" /> Home</span>
                </div>
                <div className="rounded-lg bg-background/65 p-2 text-center">
                  <ClubShirt kit={clubKit.away} badge={clubKit.badge} clubName={club || "New Club"} size={58} />
                  <span className="mt-1 flex items-center justify-center gap-1 text-[9px] font-semibold text-muted-foreground"><Shirt className="size-3" /> Away</span>
                </div>
              </div>
            </section>
            <div className="space-y-2">
              <Label>Starting regional league</Label>
              <div className="grid grid-cols-2 gap-2">
                {STARTING_REGIONAL_DIVISIONS.map((division) => (
                  <button
                    key={division.id}
                    type="button"
                    onClick={() => setStartingDivisionId(division.id)}
                    aria-pressed={division.id === startingDivisionId}
                    className={cn(
                      "rounded-xl border-2 p-3 text-left text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                      division.id === startingDivisionId
                        ? "border-primary bg-primary/15"
                        : "border-border bg-muted/65 hover:bg-muted",
                    )}
                  >
                    <span className="block text-xs font-semibold">
                      {leaguePresentationName(division.name)}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">
                      Level 7 · {division.clubCount} clubs
                    </span>
                  </button>
                ))}
              </div>
            </div>
            {activeSlotUnreadable && <p role="alert" className="rounded-lg border border-amber-500 bg-amber-500/10 p-3 text-xs">This career could not be read. Its original save is protected. Select a different slot; do not clear this slot or browser data.</p>}

          </div>
        </div>
      </div>
      </div>
      <div className="z-10 shrink-0 border-t border-border bg-card/95 px-3 py-2 shadow-[0_-4px_16px_rgba(0,0,0,.08)] [padding-bottom:calc(.5rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-xl">
          <Button type="button" className="min-h-11 w-full text-sm font-bold" disabled={!club.trim() || activeSlotUnreadable} onClick={start}>
            <Play className="mr-2 size-4" /> Start Season
          </Button>
        </div>
      </div>
      <ChairmanStudio open={studioOpen} onOpenChange={setStudioOpen} />
      <ClubIdentitySetupSheet
        open={clubIdentityOpen}
        onOpenChange={setClubIdentityOpen}
        clubName={club}
        nickname={nickname}
        kit={clubKit}
        onSave={({ clubName, nickname: nextNickname, kit }) => {
          setClub(clubName);
          setNickname(nextNickname);
          setClubKit(kit);
          setClubIdentityTouched(true);
        }}
      />
    </div>
  );
}
