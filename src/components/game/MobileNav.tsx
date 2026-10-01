import { useState } from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetClose } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ALL_TABS, PRIMARY_TAB_IDS, type Tab } from "./tabs";

/**
 * `blocking` is the number of inbox items that must be dealt with before the
 * game can advance. When there are any, the Inbox tab shows a bouncing "!"
 * instead of the unread count, so you see it before pressing Continue.
 */
export function MobileNav({ tab, setTab, unread, blocking = 0 }: { tab: Tab; setTab: (t: Tab) => void; unread: number; blocking?: number }) {
  const [open, setOpen] = useState(false);
  const primary = ALL_TABS.filter(([id]) => PRIMARY_TAB_IDS.includes(id));
  const secondary = ALL_TABS.filter(([id]) => !PRIMARY_TAB_IDS.includes(id));
  return (
    <nav className="lf-mobile-nav md:hidden sticky top-0 z-40 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85 shadow-sm">
      <ul className="lf-mobile-nav-grid grid grid-cols-6">
        {primary.map(([id, label, Icon]) => (
          <li key={id}>
            <button
              onClick={() => setTab(id)}
              className={cn(
                "lf-mobile-nav-item relative w-full min-h-10 flex flex-col items-center justify-center gap-0 py-0.5 text-[8px] font-semibold transition-colors",
                tab === id ? "is-active text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="size-3.5" />
              <span className="truncate max-w-full px-0.5">{id === "stadium" ? "Club" : label}</span>
              {id === "inbox" && blocking > 0 ? (
                <span
                  className="lf-nav-blocker absolute top-0 right-[calc(50%-17px)] grid size-4 place-items-center rounded-full border-2 border-white bg-rose-500 text-[9px] font-black leading-none text-white"
                  aria-label={`${blocking} ${blocking === 1 ? "item needs" : "items need"} your attention before you can continue`}
                  title="Needs your attention before you can continue"
                >
                  !
                </span>
              ) : (
                id === "inbox" &&
                unread > 0 && (
                  <span className="absolute top-0 right-[calc(50%-17px)] min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] leading-4 text-center font-semibold">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )
              )}
            </button>
          </li>
        ))}
        <li><Sheet open={open} onOpenChange={setOpen}><SheetTrigger asChild><button className={cn("lf-mobile-nav-item w-full min-h-10 flex flex-col items-center justify-center gap-0 py-0.5 text-[8px] font-semibold", !PRIMARY_TAB_IDS.includes(tab) ? "is-active text-primary" : "text-muted-foreground")}><Menu className="size-3.5" />More</button></SheetTrigger><SheetContent side="bottom" className="rounded-t-3xl max-h-[82vh] overflow-y-auto"><SheetHeader><SheetTitle>More club areas</SheetTitle></SheetHeader><div className="grid grid-cols-2 gap-3 mt-5 pb-4">{secondary.map(([id, label, Icon]) => <SheetClose asChild key={id}><button onClick={() => setTab(id)} className={cn("min-h-20 flex flex-col items-start justify-between gap-2 rounded-2xl border p-3 text-left font-semibold transition-colors", tab === id ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted")}><Icon className="size-6" /><span>{label}</span></button></SheetClose>)}</div></SheetContent></Sheet></li>
      </ul>
    </nav>
  );
}