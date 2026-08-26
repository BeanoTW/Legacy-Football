import { useState } from "react";
import { Menu } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ALL_TABS, PRIMARY_TAB_IDS, type Tab } from "./tabs";

export function MobileNav({
  tab,
  setTab,
  unread,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  unread: number;
}) {
  const [open, setOpen] = useState(false);
  const primary = ALL_TABS.filter(([id]) => PRIMARY_TAB_IDS.includes(id));
  const secondary = ALL_TABS.filter(([id]) => !PRIMARY_TAB_IDS.includes(id));
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(0,0,0,0.08)]">
      <ul className="grid grid-cols-5">
        {primary.map(([id, label, Icon]) => (
          <li key={id}>
            <button
              onClick={() => setTab(id)}
              className={cn(
                "relative w-full min-h-16 flex flex-col items-center justify-center gap-1 py-2 text-[11px] font-semibold transition-colors",
                tab === id ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="size-6" />
              {label}
              {id === "inbox" && unread > 0 && (
                <span className="absolute top-1.5 right-[calc(50%-21px)] min-w-5 h-5 px-1 rounded-full bg-rose-500 text-white text-[10px] leading-5 text-center font-semibold">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </button>
          </li>
        ))}

        <li>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                className={cn(
                  "w-full min-h-16 flex flex-col items-center justify-center gap-1 py-2 text-[11px] font-semibold",
                  !PRIMARY_TAB_IDS.includes(tab) ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Menu className="size-6" />
                More
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-3xl max-h-[82vh] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>More club areas</SheetTitle>
              </SheetHeader>
              <div className="grid grid-cols-2 gap-3 mt-5 pb-4">
                {secondary.map(([id, label, Icon]) => (
                  <SheetClose asChild key={id}>
                    <button
                      onClick={() => setTab(id)}
                      className={cn(
                        "min-h-24 flex flex-col items-start justify-between gap-3 rounded-2xl border p-4 text-left font-semibold transition-colors",
                        tab === id
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card hover:bg-muted",
                      )}
                    >
                      <Icon className="size-7" />
                      <span>{label}</span>
                    </button>
                  </SheetClose>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </li>
      </ul>
    </nav>
  );
}
