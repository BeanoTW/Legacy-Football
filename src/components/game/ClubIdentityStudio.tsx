import { useMemo, useState, type ReactNode } from "react";
import { Check, RotateCcw, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { GameState } from "@/lib/game/types";
import {
  BADGE_DIVISIONS,
  BADGE_EMBLEMS,
  BADGE_SHAPES,
  KIT_COLLARS,
  KIT_COLOURS,
  KIT_PATTERNS,
  cleanInitials,
  cleanSponsor,
  cleanYear,
  clubKitFor,
  defaultAwayKit,
  kitFromBadge,
  randomClubKit,
  setClubKit,
  type BadgeDesign,
  type ClubKitState,
  type KitDesign,
} from "@/lib/game/clubKit";
import { ClubBadge, ClubShirt } from "./ClubKitArt";

type Section = "badge" | "home" | "away";

const SHAPE_LABEL: Record<BadgeDesign["shape"], string> = {
  shield: "Shield",
  classic: "Classic",
  round: "Round",
  roundel: "Roundel",
  pennant: "Pennant",
  diamond: "Diamond",
  octagon: "Octagon",
  square: "Square",
};
const DIVISION_LABEL: Record<BadgeDesign["division"], string> = {
  plain: "Plain",
  perPale: "Halved",
  perFess: "Split",
  perBend: "Diagonal",
  quarterly: "Quartered",
  stripes: "Stripes",
  hoops: "Hoops",
  chevron: "Chevron",
  cross: "Cross",
  saltire: "Saltire",
  chief: "Top band",
};
const EMBLEM_LABEL: Record<BadgeDesign["emblem"], string> = {
  none: "None",
  ball: "Ball",
  star: "Star",
  crown: "Crown",
  castle: "Castle",
  anchor: "Anchor",
  swallow: "Swallow",
  oak: "Oak",
  wheel: "Wheel",
  locomotive: "Engine",
  mountains: "Peaks",
  waves: "Waves",
  hammers: "Hammers",
};
const PATTERN_LABEL: Record<KitDesign["pattern"], string> = {
  plain: "Plain",
  stripes: "Stripes",
  pinstripes: "Pinstripe",
  hoops: "Hoops",
  halves: "Halves",
  quarters: "Quarters",
  sash: "Sash",
  chevron: "Chevron",
  band: "Chest band",
};
const COLLAR_LABEL: Record<KitDesign["collar"], string> = { crew: "Crew", vneck: "V-neck", polo: "Polo" };
const LETTERING_LABEL: Record<BadgeDesign["lettering"], string> = { none: "None", initials: "Ribbon", ring: "Name & year" };

/** Opens the builder as a sheet; drop it anywhere that has game state. */
export function ClubIdentitySheet({
  open,
  onOpenChange,
  state,
  update,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex max-h-[94dvh] flex-col gap-0 overflow-hidden rounded-t-2xl p-0 md:inset-x-auto md:right-4 md:bottom-4 md:w-[34rem] md:rounded-2xl md:border">
        <SheetTitle className="sr-only">Club identity</SheetTitle>
        <SheetDescription className="sr-only">Design your club badge, home kit and away kit.</SheetDescription>
        {open ? <ClubIdentityStudio state={state} update={update} onDone={() => onOpenChange(false)} /> : null}
      </SheetContent>
    </Sheet>
  );
}

export function ClubIdentityStudio({
  state,
  update,
  onDone,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
  onDone?: () => void;
}) {
  const saved = useMemo(() => clubKitFor(state), [state]);
  const [draft, setDraft] = useState<ClubKitState>(saved);
  const [section, setSection] = useState<Section>("badge");
  const [justSaved, setJustSaved] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const name = state.clubName;

  const setBadge = (patch: Partial<BadgeDesign>) => {
    setJustSaved(false);
    setDraft((current) => ({ ...current, badge: { ...current.badge, ...patch } }));
  };
  const setKit = (which: "home" | "away", patch: Partial<KitDesign>) => {
    setJustSaved(false);
    setDraft((current) => ({ ...current, [which]: { ...current[which], ...patch } }));
  };

  const save = () => {
    update((current) => setClubKit(current, draft));
    setJustSaved(true);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Dressing-room preview: the one bold moment of the screen. */}
      <div className="relative shrink-0 overflow-hidden bg-[radial-gradient(120%_90%_at_50%_0%,#1f5a57_0%,#0e2e2d_55%,#081d1c_100%)] px-4 pb-3 pt-4 text-white">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/20" aria-hidden="true" />
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate font-display text-xl leading-tight">{name}</h2>
            <p className="text-xs text-white/60">{draft.badge.founded ? `Founded ${draft.badge.founded}` : "Club identity"}</p>
          </div>
          {onDone ? (
            <button type="button" onClick={onDone} className="shrink-0 rounded-md px-2 py-1 text-xs text-white/70 hover:bg-white/10 hover:text-white">
              Close
            </button>
          ) : null}
        </div>
        <div className="mt-3 grid grid-cols-[1fr_1.15fr_1fr] items-end gap-2">
          <PreviewSlot active={section === "badge"} onClick={() => setSection("badge")} label="Badge">
            <ClubBadge design={draft.badge} clubName={name} size="100%" className="drop-shadow-[0_6px_10px_rgba(0,0,0,.45)]" />
          </PreviewSlot>
          <PreviewSlot active={section === "home"} onClick={() => setSection("home")} label="Home">
            <ClubShirt kit={draft.home} badge={draft.badge} clubName={name} full size="100%" className="drop-shadow-[0_8px_12px_rgba(0,0,0,.5)]" label="Home kit" />
          </PreviewSlot>
          <PreviewSlot active={section === "away"} onClick={() => setSection("away")} label="Away">
            <ClubShirt kit={draft.away} badge={draft.badge} clubName={name} full size="100%" className="drop-shadow-[0_8px_12px_rgba(0,0,0,.5)]" label="Away kit" />
          </PreviewSlot>
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-3 gap-1 border-b bg-card p-2" role="tablist" aria-label="What to edit">
        {(["badge", "home", "away"] as const).map((key) => (
          <Button
            key={key}
            role="tab"
            aria-selected={section === key}
            variant={section === key ? "default" : "outline"}
            size="sm"
            onClick={() => setSection(key)}
          >
            {key === "badge" ? "Badge" : key === "home" ? "Home kit" : "Away kit"}
          </Button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain bg-card px-4 py-4">
        {section === "badge" ? (
          <BadgeEditor badge={draft.badge} name={name} onChange={setBadge} />
        ) : (
          <KitEditor
            which={section}
            kit={draft[section]}
            home={draft.home}
            badge={draft.badge}
            name={name}
            onChange={(patch) => setKit(section, patch)}
          />
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t bg-card px-4 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
        <Button variant="ghost" size="sm" onClick={() => { setJustSaved(false); setDraft(randomClubKit(name)); }}>
          <Shuffle /> Surprise me
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!dirty}
          onClick={() => { setJustSaved(false); setDraft(saved); }}
        >
          <RotateCcw /> Undo changes
        </Button>
        <Button className="ml-auto" size="sm" disabled={!dirty && !justSaved} onClick={save}>
          {justSaved && !dirty ? <><Check /> Saved</> : "Save identity"}
        </Button>
      </div>
    </div>
  );
}

function PreviewSlot({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`Edit ${label.toLowerCase()}`}
      className={cn(
        "group flex flex-col items-center gap-1 rounded-xl p-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
        active ? "bg-white/10" : "hover:bg-white/5",
      )}
    >
      <span className={cn("block w-full transition-transform duration-200 motion-reduce:transition-none", active ? "scale-100" : "scale-90 opacity-80")}>{children}</span>
      <span className={cn("text-[11px] font-medium", active ? "text-white" : "text-white/55")}>{label}</span>
    </button>
  );
}

function Field({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

function OptionGrid<T extends string>({
  options,
  value,
  onChange,
  render,
  label,
  columns = "grid-cols-4",
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  render: (option: T) => ReactNode;
  label: (option: T) => string;
  columns?: string;
}) {
  return (
    <div className={cn("grid gap-1.5", columns)}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={option === value}
          onClick={() => onChange(option)}
          className={cn(
            "flex flex-col items-center gap-1 rounded-lg border px-1 pb-1.5 pt-2 text-[11px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
            option === value ? "border-primary bg-primary/10 font-semibold" : "border-transparent bg-muted/40 hover:bg-muted",
          )}
        >
          <span className="flex h-11 items-center justify-center">{render(option)}</span>
          <span className="truncate">{label(option)}</span>
        </button>
      ))}
    </div>
  );
}

function Segmented<T extends string>({ options, value, onChange, label }: { options: readonly T[]; value: T; onChange: (value: T) => void; label: (option: T) => string }) {
  return (
    <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={option === value}
          onClick={() => onChange(option)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs transition-colors",
            option === value ? "bg-background font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label(option)}
        </button>
      ))}
    </div>
  );
}

function ColourRow({ title, value, onChange }: { title: string; value: string; onChange: (hex: string) => void }) {
  const known = KIT_COLOURS.find((colour) => colour.hex === value.toLowerCase());
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="font-medium">{title}</span>
        <span className="text-muted-foreground">{known?.name ?? "Custom"}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {KIT_COLOURS.map((colour) => (
          <button
            key={colour.hex}
            type="button"
            aria-label={colour.name}
            aria-pressed={colour.hex === value.toLowerCase()}
            onClick={() => onChange(colour.hex)}
            className={cn(
              "size-7 rounded-full border border-black/15 transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
              colour.hex === value.toLowerCase() && "ring-2 ring-primary ring-offset-2 ring-offset-background",
            )}
            style={{ background: colour.hex }}
          />
        ))}
        <label
          className={cn(
            "relative grid size-7 cursor-pointer place-items-center overflow-hidden rounded-full border border-dashed border-muted-foreground/60 text-[10px] text-muted-foreground",
            !known && "ring-2 ring-primary ring-offset-2 ring-offset-background",
          )}
          style={!known ? { background: value } : undefined}
          title="Choose any colour"
        >
          {known ? "+" : null}
          <input
            type="color"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label={`${title}: any colour`}
          />
        </label>
      </div>
    </div>
  );
}

function TextField({ label, value, onChange, placeholder, inputMode, maxLength }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; inputMode?: "text" | "numeric"; maxLength: number }) {
  return (
    <label className="block min-w-0 flex-1">
      <span className="mb-1 block text-xs font-medium">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        maxLength={maxLength}
        className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
      />
    </label>
  );
}

function BadgeEditor({ badge, name, onChange }: { badge: BadgeDesign; name: string; onChange: (patch: Partial<BadgeDesign>) => void }) {
  return (
    <>
      <Field title="Shape">
        <OptionGrid
          options={BADGE_SHAPES}
          value={badge.shape}
          onChange={(shape) => onChange({ shape })}
          label={(option) => SHAPE_LABEL[option]}
          render={(option) => <ClubBadge design={{ ...badge, shape: option, lettering: "none" }} size={40} clubName={name} />}
        />
      </Field>
      <Field title="Emblem">
        <OptionGrid
          options={BADGE_EMBLEMS}
          value={badge.emblem}
          onChange={(emblem) => onChange({ emblem })}
          label={(option) => EMBLEM_LABEL[option]}
          render={(option) => <ClubBadge design={{ ...badge, emblem: option, lettering: "none", division: "plain" }} size={40} />}
          columns="grid-cols-5"
        />
      </Field>
      <Field title="Pattern">
        <OptionGrid
          options={BADGE_DIVISIONS}
          value={badge.division}
          onChange={(division) => onChange({ division })}
          label={(option) => DIVISION_LABEL[option]}
          render={(option) => <ClubBadge design={{ ...badge, division: option, emblem: "none", lettering: "none" }} size={40} />}
        />
      </Field>
      <Field title="Colours">
        <div className="space-y-3">
          <ColourRow title="Main" value={badge.primary} onChange={(primary) => onChange({ primary })} />
          <ColourRow title="Second" value={badge.secondary} onChange={(secondary) => onChange({ secondary })} />
          <ColourRow title="Emblem" value={badge.emblemColour} onChange={(emblemColour) => onChange({ emblemColour })} />
          <ColourRow title="Border and lettering" value={badge.accent} onChange={(accent) => onChange({ accent })} />
        </div>
      </Field>
      <Field title="Lettering" hint={badge.lettering === "ring" && !badge.shape.startsWith("round") ? "Shows the year either side of the emblem" : undefined}>
        <Segmented options={["none", "initials", "ring"] as const} value={badge.lettering} onChange={(lettering) => onChange({ lettering })} label={(option) => LETTERING_LABEL[option]} />
        <div className="mt-3 flex gap-3">
          <TextField label="Initials" value={badge.initials} maxLength={4} placeholder="DTFC" onChange={(value) => onChange({ initials: cleanInitials(value) })} />
          <TextField label="Founded" value={badge.founded} maxLength={4} placeholder="1897" inputMode="numeric" onChange={(value) => onChange({ founded: cleanYear(value) })} />
        </div>
      </Field>
    </>
  );
}

function KitEditor({
  which,
  kit,
  home,
  badge,
  name,
  onChange,
}: {
  which: "home" | "away";
  kit: KitDesign;
  home: KitDesign;
  badge: BadgeDesign;
  name: string;
  onChange: (patch: Partial<KitDesign>) => void;
}) {
  return (
    <>
      <Field title="Pattern">
        <OptionGrid
          options={KIT_PATTERNS}
          value={kit.pattern}
          onChange={(pattern) => onChange({ pattern })}
          label={(option) => PATTERN_LABEL[option]}
          render={(option) => <ClubShirt kit={{ ...kit, pattern: option, sponsor: "" }} size={44} />}
          columns="grid-cols-3 sm:grid-cols-5"
        />
      </Field>
      <Field title="Collar">
        <Segmented options={KIT_COLLARS} value={kit.collar} onChange={(collar) => onChange({ collar })} label={(option) => COLLAR_LABEL[option]} />
      </Field>
      <Field title="Colours">
        {which === "home" ? (
          <Button variant="outline" size="sm" className="mb-3" onClick={() => onChange(kitFromBadge(badge, kit))}>
            Use badge colours
          </Button>
        ) : null}
        <div className="space-y-3">
          <ColourRow title="Shirt" value={kit.body} onChange={(body) => onChange({ body })} />
          <ColourRow title="Pattern" value={kit.secondary} onChange={(secondary) => onChange({ secondary })} />
          <ColourRow title="Sleeves" value={kit.sleeves} onChange={(sleeves) => onChange({ sleeves })} />
          <ColourRow title="Trim" value={kit.trim} onChange={(trim) => onChange({ trim })} />
          <ColourRow title="Shorts" value={kit.shorts} onChange={(shorts) => onChange({ shorts })} />
          <ColourRow title="Socks" value={kit.socks} onChange={(socks) => onChange({ socks })} />
        </div>
      </Field>
      <Field title="Shirt sponsor" hint="Up to 14 characters">
        <TextField label="Sponsor name" value={kit.sponsor} maxLength={14} placeholder={`${name.split(" ")[0]} Rail`} onChange={(value) => onChange({ sponsor: cleanSponsor(value) })} />
      </Field>
      {which === "away" ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange({ ...defaultAwayKit(home.body, home.secondary), sponsor: kit.sponsor })}
        >
          Suggest a contrasting away kit
        </Button>
      ) : null}
    </>
  );
}