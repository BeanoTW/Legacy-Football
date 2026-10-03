import { useState } from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetClose } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ALL_TABS, type Tab } from "./tabs";

/**
 * Compact mobile navigation entry point. Home stays exposed beside Continue;
 * everything else lives in this single menu button.
 */
export function MobileNav({ tab, setTab, unread, blocking = 0 }: { tab: Tab; setTab: (t: Tab) => void; unread: number; blocking?: number }) {
  const [open, setOpen] = useState(false);
  const destinations = ALL_TABS.filter(([id]) => id !== "hub");
  const badge = blocking > 0 ? "!" : unread > 0 ? (unread > 9 ? "9+" : String(unread)) : null;

  return (
    <div className="lf-mobile-menu-control md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            className={cn(
              "lf-mobile-menu-button",
              tab !== "hub" && "is-active",
            )}
            aria-label="Open navigation"
          >
            <Menu className="size-5" />
            {badge && (
              <span
                className={cn("lf-mobile-menu-badge", blocking > 0 && "is-blocking")}
                aria-label={blocking > 0 ? \`\${blocking} item\${blocking === 1 ? "" : "s"} need attention\` : \`\${unread} unread briefing\${unread === 1 ? "" : "s"}\`}
              >
                {badge}
              </span>
            )}
          </button>
        </SheetTrigger>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[82vh] overflow-y-auto">
          <SheetHeader><SheetTitle>Club areas</SheetTitle></SheetHeader>
          <div className="grid grid-cols-2 gap-3 mt-5 pb-4">
            {destinations.map(([id, label, Icon]) => (
              <SheetClose asChild key={id}>
                <button
                  onClick={() => setTab(id)}
                  className={cn(
                    "min-h-20 flex flex-col items-start justify-between gap-2 rounded-2xl border p-3 text-left font-semibold transition-colors",
                    tab === id ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted",
                  )}
                >
                  <Icon className="size-6" />
                  <span>{id === "stadium" ? "Club" : label}</span>
                </button>
              </SheetClose>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
