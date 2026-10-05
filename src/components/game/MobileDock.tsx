import { useState } from "react";
import { ChevronUp, Menu, Pause, Play } from "lucide-react";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { AdvanceTarget } from "@/lib/game/advancePlanner";
import { ALL_TABS, type Tab } from "./tabs";

const LEFT: Tab[] = ["hub", "inbox", "squad"];
const RIGHT: Tab[] = ["recruitment", "stadium"];
const SHORT_LABEL: Partial<Record<Tab, string>> = { hub: "Home", stadium: "Club" };

/**
 * Mobile navigation and time controls in one bar. The raised centre button opens
 * the Advance preview before time moves (Stop while advancing).
 */
export function MobileDock({
  tab,
  setTab,
  unread,
  blocking,
  isContinuing,
  onContinue,
  onStop,
  targets = [],
  onAdvanceTo,
}: {
  tab: Tab;
  setTab: (tab: Tab) => void;
  unread: number;
  blocking: number;
  isContinuing: boolean;
  onContinue: () => void;
  onStop: () => void;
  targets?: AdvanceTarget[];
  onAdvanceTo?: (target: AdvanceTarget) => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const byId = new Map(ALL_TABS.map((entry) => [entry[0], entry]));
  const secondary = ALL_TABS.filter(([id]) => ![...LEFT, ...RIGHT].includes(id));
  const nextMatch = targets.find((target) => target.id === "matchday");
  const choices = targets.filter((target) => target.id !== "anything");
  const caption = isContinuing
    ? "Stop"
    : blocking > 0
      ? "Decide"
      : "Advance";

  const TabButton = ({ id }: { id: Tab }) => {
    const entry = byId.get(id);
    if (!entry) return null;
    const [, label, Icon] = entry;
    return (
      <button
        type="button"
        onClick={() => setTab(id)}
        className={cn("lf-dock-item", tab === id && "is-active")}
        aria-current={tab === id ? "page" : undefined}
      >
        <Icon className="lf-dock-icon" />
        <span className="lf-dock-label">{SHORT_LABEL[id] ?? label}</span>
        {id === "inbox" && blocking > 0 ? (
          <span
            className="lf-dock-badge is-blocking"
            aria-label={`${blocking} ${blocking === 1 ? "item needs" : "items need"} your attention before you can continue`}
          >
            !
          </span>
        ) : id === "inbox" && unread > 0 ? (
          <span className="lf-dock-badge">{unread > 9 ? "9+" : unread}</span>
        ) : null}
      </button>
    );
  };

  return (
    <nav className="lf-dock md:hidden" aria-label="Primary navigation">
      <div className="lf-dock-row">
        {LEFT.map((id) => <TabButton key={id} id={id} />)}

        <div className="lf-dock-centre">
          <button
            type="button"
            onClick={isContinuing ? onStop : onContinue}
            className={cn(
              "lf-dock-advance",
              isContinuing && "is-running",
              !isContinuing && blocking > 0 && "is-blocked",
            )}
            aria-label={
              isContinuing
                ? "Stop advancing"
                : blocking > 0
                  ? "Decisions needed before you can continue"
                  : `Continue${nextMatch ? ` to ${nextMatch.detail}` : ""}`
            }
          >
            {isContinuing ? (
              <Pause className="size-6" fill="currentColor" />
            ) : (
              <Play className="lf-dock-play size-7" fill="currentColor" />
            )}
            {!isContinuing && blocking > 0 && (
              <span className="lf-dock-advance-flag" aria-hidden="true">!</span>
            )}
          </button>

          {!isContinuing && onAdvanceTo && choices.length > 0 && blocking === 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="lf-dock-advance-more" aria-label="Choose where to stop">
                  <ChevronUp className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="center" className="w-72">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  Time still stops early for matches and decisions.
                </DropdownMenuLabel>
                {choices.map((target) => (
                  <DropdownMenuItem
                    key={target.id}
                    onSelect={() => onAdvanceTo(target)}
                    className="flex flex-col items-start gap-0.5 py-2"
                  >
                    <span className="text-sm font-semibold">{target.label}</span>
                    <span className="text-xs text-muted-foreground">{target.detail}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}

          <span className="lf-dock-caption">{caption}</span>
        </div>

        {RIGHT.map((id) => <TabButton key={id} id={id} />)}

        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className={cn("lf-dock-item", ![...LEFT, ...RIGHT].includes(tab) && "is-active")}
            >
              <Menu className="lf-dock-icon" />
              <span className="lf-dock-label">More</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[82vh] overflow-y-auto rounded-t-3xl">
            <SheetHeader className="items-center text-center">
              <div className="text-[9px] font-black uppercase tracking-[0.22em] text-fuchsia-600/80 dark:text-fuchsia-300/80">
                Owner-Director
              </div>
              <SheetTitle>More club areas</SheetTitle>
              <div
                className="mt-1 h-[3px] w-28 rounded-full bg-gradient-to-r from-fuchsia-500 via-violet-500 to-purple-500 shadow-[0_0_14px_rgba(168,85,247,0.28)]"
                aria-hidden="true"
              />
            </SheetHeader>
            <div className="mt-5 grid grid-cols-2 gap-3 pb-4">
              {secondary.map(([id, label, Icon]) => (
                <SheetClose asChild key={id}>
                  <button
                    type="button"
                    onClick={() => setTab(id)}
                    className={cn(
                      "flex min-h-20 flex-col items-start justify-between gap-2 rounded-2xl border p-3 text-left font-semibold transition-colors",
                      tab === id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-card hover:bg-muted",
                    )}
                  >
                    <Icon className="size-6" />
                    <span>{label}</span>
                  </button>
                </SheetClose>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
