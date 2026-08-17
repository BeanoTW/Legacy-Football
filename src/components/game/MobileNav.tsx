import { useState } from "react";
import { Menu } from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetClose,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ALL_TABS, PRIMARY_TAB_IDS, type Tab } from "./tabs";

export function MobileNav({ tab, setTab, unread }: { tab: Tab; setTab: (t: Tab) => void; unread: number }) {
  const [open, setOpen] = useState(false);
  const primary = ALL_TABS.filter(([id]) => PRIMARY_TAB_IDS.includes(id));
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 pb-[env(safe-area-inset-bottom)]">
      <ul className="grid grid-cols-5">
        {primary.map(([id, label, Icon]) => (
          <li key={id}>
            <button
              onClick={() => setTab(id)}
              className={cn(
                "relative w-full flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
                tab === id ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="size-5" />
              {label}
              {id === "inbox" && unread > 0 && (
                <span className="absolute top-1 right-[calc(50%-18px)] min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] leading-4 text-center font-semibold">
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
                  "w-full flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium",
                  !PRIMARY_TAB_IDS.includes(tab) ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Menu className="size-5" />
                More
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-2xl">
              <SheetHeader>
                <SheetTitle>Navigate</SheetTitle>
              </SheetHeader>
              <div className="grid grid-cols-3 gap-2 mt-4">
                {ALL_TABS.map(([id, label, Icon]) => (
                  <SheetClose asChild key={id}>
                    <button
                      onClick={() => setTab(id)}
                      className={cn(
                        "flex flex-col items-center justify-center gap-1 rounded-lg border p-3 text-xs font-medium transition-colors",
                        tab === id
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card hover:bg-muted",
                      )}
                    >
                      <Icon className="size-5" />
                      {label}
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
