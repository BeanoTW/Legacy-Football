/* =========================================================================
   Inbox / Communication Framework
   -------------------------------------------------------------------------
   Every department in the club communicates with the player through here.
   To wire a new system into the inbox:

     1. Add a Generator object to GENERATORS below (or in its own file and
        re-export). It receives a snapshot of the state, may read flags,
        and returns any new InboxItems to append. Generators are pure —
        they never mutate state and never apply effects directly.
     2. Choices carry InboxEffect[] atoms; applyEffects() is the only
        thing that mutates state. Add a new effect kind by extending the
        InboxEffect union in types.ts and adding a case here.
     3. Chained follow-ups use { kind: "scheduleGenerator", ... } or an
        inboxFlags value that a future generator's run() inspects.

   The engine runs runWeeklyGenerators() at the end of advanceWeek() so
   the player wakes up each Monday to a fresh Inbox.
========================================================================= */

import type {
  GameState,
  InboxItem,
  InboxEffect,
  InboxChoice,
  InboxDepartment,
  InboxCategory,
  InboxPriority,
  Sponsor,
} from "./types";

/* ---------- id + helpers ---------- */
let __counter = 0;
const nextId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(++__counter).toString(36)}`;

const money = (n: number) => {
  const s = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${s}£${(a / 1_000_000).toFixed(2)}M`;
  if (a >= 1_000) return `${s}£${(a / 1_000).toFixed(0)}k`;
  return `${s}£${a.toFixed(0)}`;
};

/* ---------- Effect application (the ONLY state mutator) ---------- */
export function applyEffects(state: GameState, effects: InboxEffect[]): GameState {
  const s = structuredClone(state);
  for (const e of effects) {
    switch (e.kind) {
      case "cash":
        s.cash = Math.round(s.cash + e.amount);
        // Fold into current week's ledger if present, else append a synthetic one
        {
          const last = s.ledger[s.ledger.length - 1];
          const bucket = e.amount >= 0 ? "other" : "other";
          if (last && last.week === s.week && last.season === s.season) {
            if (e.amount >= 0) last.income[bucket] += e.amount;
            else last.expenses[bucket] += -e.amount;
            last.net = Object.values(last.income).reduce((a, b) => a + b, 0)
                     - Object.values(last.expenses).reduce((a, b) => a + b, 0);
            last.balance = s.cash;
          }
        }
        break;
      case "fanHappiness":
        s.fanHappiness = Math.max(0, Math.min(100, s.fanHappiness + e.delta));
        break;
      case "reputation":
        s.reputation = Math.max(1, Math.min(100, s.reputation + e.delta));
        break;
      case "pitch":
        s.pitchCondition = Math.max(20, Math.min(100, s.pitchCondition + e.delta));
        break;
      case "standCondition": {
        const st = s.stands.find((x) => x.key === e.standKey);
        if (st) st.condition = Math.max(20, Math.min(100, st.condition + e.delta));
        break;
      }
      case "sponsorExtend": {
        const sp = s.sponsors.find((x: Sponsor) => x.name === e.sponsorName);
        if (sp) {
          sp.weeksLeft += e.addWeeks;
          if (e.newWeekly != null) sp.weekly = e.newWeekly;
        }
        break;
      }
      case "flag":
        s.inboxFlags[e.key] = e.value;
        break;
      case "scheduleGenerator":
        s.scheduledGenerators.push({
          generatorId: e.generatorId,
          dueWeek: ((s.week + e.inWeeks - 1) % 46) + 1,
          dueSeason: s.season + Math.floor((s.week + e.inWeeks - 1) / 46),
        });
        break;
    }
  }
  return s;
}

/* ---------- Player actions ---------- */
export function markInboxRead(s: GameState, id: string): GameState {
  const ns = structuredClone(s);
  const it = ns.inbox.find((i) => i.id === id);
  if (it && it.status === "unread") it.status = it.choices ? "awaitingDecision" : "read";
  return ns;
}

export function handleInboxChoice(s: GameState, itemId: string, choiceId: string): GameState {
  const item = s.inbox.find((i) => i.id === itemId);
  if (!item || !item.choices) return s;
  const choice = item.choices.find((c) => c.id === choiceId);
  if (!choice) return s;
  let ns = applyEffects(s, choice.effects);
  ns.inbox = ns.inbox.map((i) =>
    i.id === itemId ? { ...i, status: "completed", chosenChoiceId: choiceId } : i,
  );
  return ns;
}

export function dismissInboxItem(s: GameState, id: string): GameState {
  const ns = structuredClone(s);
  const it = ns.inbox.find((i) => i.id === id);
  if (it && it.status !== "awaitingDecision") it.status = "read";
  return ns;
}

export function clearReadInbox(s: GameState): GameState {
  const ns = structuredClone(s);
  ns.inbox = ns.inbox.filter(
    (i) => i.status === "unread" || i.status === "awaitingDecision",
  );
  return ns;
}

export const unreadCount = (s: GameState) =>
  s.inbox.filter((i) => i.status === "unread" || i.status === "awaitingDecision").length;

/* =========================================================================
   Generators
   -------------------------------------------------------------------------
   Each generator: pure function of state. Return items to append. Use
   inboxFlags to avoid re-emitting the same message. Use scheduledGenerators
   for time-delayed follow-ups (checked at the top of runWeeklyGenerators).
========================================================================= */

interface Generator {
  id: string;
  run: (s: GameState, dueNow: boolean) => InboxItem[];
}

const mk = (
  s: GameState,
  generatorId: string,
  partial: Omit<InboxItem,
    "id" | "generatorId" | "week" | "season" | "status"
  > & { status?: InboxItem["status"] },
): InboxItem => ({
  id: nextId(generatorId),
  generatorId,
  week: s.week,
  season: s.season,
  status: partial.choices ? "unread" : "unread",
  ...partial,
});

/* -- 1. Welcome from the Board -- */
const G_WELCOME: Generator = {
  id: "board-welcome",
  run: (s) => {
    if (s.inboxFlags["welcomed"]) return [];
    return [
      mk(s, "board-welcome", {
        sender: "Bill Roberts",
        department: "Board of Directors",
        category: "board",
        priority: "normal",
        subject: `Welcome to ${s.clubName}`,
        body:
          `Welcome aboard. As chairman you'll receive every report, decision ` +
          `and opportunity through this inbox — from finance, the manager, ` +
          `groundskeeping, sponsors, the league, all of it.\n\n` +
          `We expect a mid-table finish this season. Keep the books healthy ` +
          `and the fans on side and we'll leave you to it.`,
        // The welcome carries a one-time flag-setting "acknowledge" so it
        // never fires again.
        choices: [
          {
            id: "ack",
            label: "Understood",
            hint: "Acknowledge and set to work.",
            effects: [{ kind: "flag", key: "welcomed", value: true }],
          },
        ],
      }),
    ];
  },
};

/* -- 2. Weekly Finance report (from the previous week's ledger) -- */
const G_FINANCE_WEEKLY: Generator = {
  id: "finance-weekly",
  run: (s) => {
    // Report the ledger row that was just closed = previous week
    const prevW = s.week - 1;
    if (prevW < 1) return [];
    const row = s.ledger.find((l) => l.season === s.season && l.week === prevW);
    if (!row) return [];
    const inc = Object.values(row.income).reduce((a, b) => a + b, 0);
    const exp = Object.values(row.expenses).reduce((a, b) => a + b, 0);
    const tone: InboxPriority = row.net < -50_000 ? "high" : "low";
    return [
      mk(s, "finance-weekly", {
        sender: "Margaret Doyle",
        department: "Finance",
        category: "financial",
        priority: tone,
        subject: `Week ${prevW} P&L — net ${money(row.net)}`,
        body:
          `Income:  ${money(inc)}\n` +
          `  Gate .......... ${money(row.income.gate)}\n` +
          `  TV ............ ${money(row.income.tv)}\n` +
          `  Sponsor ....... ${money(row.income.sponsor)}\n` +
          `  Prize ......... ${money(row.income.prize)}\n` +
          `  Transfers ..... ${money(row.income.transfers)}\n` +
          `  Other ......... ${money(row.income.other)}\n\n` +
          `Outgoings: ${money(exp)}\n` +
          `  Player wages .. ${money(row.expenses.playerWages)}\n` +
          `  Staff wages ... ${money(row.expenses.staffWages)}\n` +
          `  Stadium ops ... ${money(row.expenses.stadiumOps)}\n` +
          `  Training ...... ${money(row.expenses.trainingOps)}\n` +
          `  Maintenance ... ${money(row.expenses.maintenance)}\n` +
          `  Matchday ...... ${money(row.expenses.matchday)}\n` +
          `  Transfers ..... ${money(row.expenses.transfers)}\n\n` +
          `Closing balance: ${money(row.balance)}` +
          (row.matchdayNote ? `\n\nNote: ${row.matchdayNote}` : ""),
      }),
    ];
  },
};

/* -- 3. Groundskeeper: South Stand roof (decision, pre-season W3) -- */
const G_ROOF: Generator = {
  id: "grounds-south-roof",
  run: (s) => {
    if (s.inboxFlags["roofHandled"]) return [];
    if (!(s.week === 3 && s.season === 1)) return [];
    return [
      mk(s, "grounds-south-roof", {
        sender: "Eddie Kerr",
        department: "Groundskeeper",
        category: "facilities",
        priority: "high",
        subject: "South Stand roof needs attention",
        body:
          `Sections of the South Stand roof are corroding. If we don't act ` +
          `before autumn storms, we're looking at leaks over ~800 seats and ` +
          `an emergency closure at worst.\n\n` +
          `Full repair now: £120k. Cosmetic patch: £40k. Leave it: your call.`,
        expiresWeek: 8,
        consequenceOnExpire: [
          { kind: "flag", key: "roofHandled", value: "ignored" },
          { kind: "standCondition", standKey: "S", delta: -12 },
          { kind: "fanHappiness", delta: -3 },
        ],
        choices: [
          {
            id: "repair",
            label: "Full repair — £120k",
            hint: "-£120k now, +10 South condition, fans notice.",
            effects: [
              { kind: "cash", amount: -120_000 },
              { kind: "standCondition", standKey: "S", delta: 10 },
              { kind: "fanHappiness", delta: 2 },
              { kind: "flag", key: "roofHandled", value: "repaired" },
            ],
          },
          {
            id: "patch",
            label: "Cosmetic patch — £40k",
            hint: "-£40k, +3 condition. Eddie will be back about this.",
            effects: [
              { kind: "cash", amount: -40_000 },
              { kind: "standCondition", standKey: "S", delta: 3 },
              { kind: "flag", key: "roofHandled", value: "patched" },
              { kind: "scheduleGenerator", generatorId: "grounds-south-roof-followup", inWeeks: 20 },
            ],
          },
          {
            id: "ignore",
            label: "Leave it for now",
            hint: "Free today, -12 condition and unhappy fans if it fails.",
            effects: [
              { kind: "flag", key: "roofHandled", value: "ignored" },
              { kind: "standCondition", standKey: "S", delta: -12 },
              { kind: "fanHappiness", delta: -3 },
            ],
          },
        ],
      }),
    ];
  },
};

/* -- 3b. Roof follow-up if patched (scheduled from the patch choice) -- */
const G_ROOF_FOLLOWUP: Generator = {
  id: "grounds-south-roof-followup",
  run: (s, dueNow) => {
    if (!dueNow) return [];
    return [
      mk(s, "grounds-south-roof-followup", {
        sender: "Eddie Kerr",
        department: "Groundskeeper",
        category: "facilities",
        priority: "normal",
        subject: "South Stand roof — patch is failing",
        body:
          `Told you it wouldn't hold. The patch is peeling and we've got ` +
          `staining above rows K–M. Proper repair now would still be £110k.`,
        choices: [
          {
            id: "repair-now",
            label: "Do the proper repair — £110k",
            hint: "-£110k, +8 South condition.",
            effects: [
              { kind: "cash", amount: -110_000 },
              { kind: "standCondition", standKey: "S", delta: 8 },
            ],
          },
          {
            id: "leave",
            label: "Live with it",
            hint: "-6 condition, small fan-happiness hit.",
            effects: [
              { kind: "standCondition", standKey: "S", delta: -6 },
              { kind: "fanHappiness", delta: -2 },
            ],
          },
        ],
      }),
    ];
  },
};

/* -- 4. Fan Liaison warning when happiness drops -- */
const G_FAN_WARN: Generator = {
  id: "fans-happiness-warning",
  run: (s) => {
    const cooldownKey = "fansWarnedAtWeek";
    const last = Number(s.inboxFlags[cooldownKey] ?? 0);
    if (s.fanHappiness >= 45) return [];
    if (s.week - last < 8) return [];
    return [
      mk(s, "fans-happiness-warning", {
        sender: "Priya Bhatt",
        department: "Fan Liaison",
        category: "warning",
        priority: "high",
        subject: `Supporters' Trust unhappy (${s.fanHappiness}/100)`,
        body:
          `Season-ticket holders are furious. Complaints centre on pricing, ` +
          `matchday atmosphere and the direction the club is heading. ` +
          `A goodwill gesture would go a long way; doing nothing risks a ` +
          `boycott.`,
        choices: [
          {
            id: "gesture",
            label: "Free travel & pie voucher — £25k",
            hint: "-£25k, +8 fan happiness.",
            effects: [
              { kind: "cash", amount: -25_000 },
              { kind: "fanHappiness", delta: 8 },
              { kind: "flag", key: cooldownKey, value: s.week },
            ],
          },
          {
            id: "statement",
            label: "Issue a statement",
            hint: "+2 happiness, no cost, unconvincing.",
            effects: [
              { kind: "fanHappiness", delta: 2 },
              { kind: "flag", key: cooldownKey, value: s.week },
            ],
          },
          {
            id: "ignore",
            label: "Ignore",
            hint: "-3 happiness, -1 reputation.",
            effects: [
              { kind: "fanHappiness", delta: -3 },
              { kind: "reputation", delta: -1 },
              { kind: "flag", key: cooldownKey, value: s.week },
            ],
          },
        ],
      }),
    ];
  },
};

/* -- 5. Sponsor renewal opportunity when a sponsor is nearly out -- */
const G_SPONSOR_RENEW: Generator = {
  id: "commercial-sponsor-renewal",
  run: (s) => {
    const items: InboxItem[] = [];
    for (const sp of s.sponsors) {
      if (sp.weeksLeft <= 0 || sp.weeksLeft > 6) continue;
      const key = `sponsorOffered-${sp.name}-s${s.season}-w${s.week}`;
      if (s.inboxFlags[`sponsorOffered-${sp.name}-s${s.season}`]) continue;
      const uplift = Math.round(sp.weekly * (0.95 + Math.random() * 0.25));
      const bonus = Math.round(sp.weekly * 8);
      items.push(
        mk(s, "commercial-sponsor-renewal", {
          sender: "Sam Iyer",
          department: "Commercial",
          category: "opportunity",
          priority: "normal",
          subject: `Renewal offer — ${sp.name}`,
          body:
            `${sp.name} are ready to extend. Their proposal: ${money(uplift)}/week ` +
            `for 2 seasons, plus a ${money(bonus)} signing bonus.\n\n` +
            `We can push for more — they may walk.`,
          reward: `+${money(bonus)} now, +${money(uplift)}/wk`,
          expiresWeek: s.week + 4,
          consequenceOnExpire: [
            { kind: "flag", key: `sponsorOffered-${sp.name}-s${s.season}`, value: "expired" },
          ],
          choices: [
            {
              id: "accept",
              label: `Accept — ${money(bonus)} + ${money(uplift)}/wk`,
              effects: [
                { kind: "cash", amount: bonus, note: "Sponsor bonus" },
                { kind: "sponsorExtend", sponsorName: sp.name, addWeeks: 76, newWeekly: uplift },
                { kind: "flag", key: `sponsorOffered-${sp.name}-s${s.season}`, value: "accepted" },
              ],
            },
            {
              id: "push",
              label: "Push for +15% (risk)",
              hint: "50/50: better deal, or they walk.",
              effects: [
                { kind: "flag", key: `sponsorOffered-${sp.name}-s${s.season}`, value: "pushed" },
                { kind: "scheduleGenerator", generatorId: "commercial-sponsor-pushback", inWeeks: 1 },
              ],
            },
            {
              id: "decline",
              label: "Decline",
              hint: "Sponsor lapses when weeks run out.",
              effects: [
                { kind: "flag", key: `sponsorOffered-${sp.name}-s${s.season}`, value: "declined" },
              ],
            },
          ],
        }),
      );
      // guard the loop id key
      void key;
    }
    return items;
  },
};

/* -- 6. Post-match media reaction -- */
const G_MEDIA_MATCH: Generator = {
  id: "media-post-match",
  run: (s) => {
    const prevW = s.week - 1;
    const r = s.results.find((x) => x.week === prevW);
    if (!r) return [];
    const key = `mediaShown-s${s.season}-w${prevW}`;
    if (s.inboxFlags[key]) return [];
    const label = r.result === "W" ? "Ecstatic" : r.result === "D" ? "Measured" : "Damning";
    const body =
      r.result === "W"
        ? `Comfortable ${r.goalsFor}-${r.goalsAgainst} ${r.home ? "home" : "away"} win vs ${r.opponent}. Back-page splash: "Chairman's model working".`
        : r.result === "D"
        ? `${r.goalsFor}-${r.goalsAgainst} draw with ${r.opponent}. Pundits split — solid point or two dropped?`
        : `Poor ${r.goalsFor}-${r.goalsAgainst} defeat to ${r.opponent}. Local paper calls for "clarity from the boardroom".`;
    return [
      mk(s, "media-post-match", {
        sender: "Chronicle sport desk",
        department: "Media",
        category: "media",
        priority: "low",
        subject: `${label} press after ${r.opponent} (${r.result})`,
        body,
        choices: [
          {
            id: "noted",
            label: "Read and file",
            effects: [{ kind: "flag", key, value: true }],
          },
        ],
      }),
    ];
  },
};

/* ---------- Registry ---------- */
const GENERATORS: Generator[] = [
  G_WELCOME,
  G_FINANCE_WEEKLY,
  G_ROOF,
  G_ROOF_FOLLOWUP,
  G_FAN_WARN,
  G_SPONSOR_RENEW,
  G_MEDIA_MATCH,
];

/* ---------- Weekly runner ---------- */
export function runWeeklyGenerators(prev: GameState): GameState {
  const s = structuredClone(prev);

  // Expire timed-out items first
  for (const it of s.inbox) {
    if (
      it.expiresWeek != null &&
      it.status !== "completed" &&
      it.status !== "expired" &&
      (s.season > it.season || s.week > it.expiresWeek)
    ) {
      it.status = "expired";
      if (it.consequenceOnExpire) {
        Object.assign(s, applyEffects(s, it.consequenceOnExpire));
      }
    }
  }

  // Compute which scheduled generators are due this week
  const dueIds = new Set<string>();
  s.scheduledGenerators = s.scheduledGenerators.filter((g) => {
    const due = g.dueSeason < s.season || (g.dueSeason === s.season && g.dueWeek <= s.week);
    if (due) dueIds.add(g.generatorId);
    return !due;
  });

  // Run every generator; each decides whether to emit
  for (const g of GENERATORS) {
    const items = g.run(s, dueIds.has(g.id));
    for (const it of items) s.inbox.push(it);
  }

  // Cap history to keep localStorage sane
  if (s.inbox.length > 200) {
    // keep all unread/awaiting + most recent 150 others
    const keep: InboxItem[] = [];
    const others: InboxItem[] = [];
    for (const it of s.inbox) {
      if (it.status === "unread" || it.status === "awaitingDecision") keep.push(it);
      else others.push(it);
    }
    s.inbox = [...keep, ...others.slice(-150)];
  }

  return s;
}

/* ---------- Display metadata (used by the UI) ---------- */
export const CATEGORY_META: Record<InboxCategory, { label: string; color: string }> = {
  information: { label: "Info", color: "bg-slate-500" },
  decision: { label: "Decision", color: "bg-amber-500" },
  warning: { label: "Warning", color: "bg-rose-500" },
  opportunity: { label: "Opportunity", color: "bg-emerald-500" },
  financial: { label: "Financial", color: "bg-sky-500" },
  staff: { label: "Staff", color: "bg-indigo-500" },
  facilities: { label: "Facilities", color: "bg-orange-500" },
  transfers: { label: "Transfers", color: "bg-violet-500" },
  board: { label: "Board", color: "bg-teal-600" },
  fans: { label: "Fans", color: "bg-pink-500" },
  league: { label: "League", color: "bg-cyan-600" },
  media: { label: "Media", color: "bg-fuchsia-500" },
};

export const PRIORITY_META: Record<InboxPriority, { label: string; className: string }> = {
  low:    { label: "Low",    className: "text-muted-foreground" },
  normal: { label: "Normal", className: "text-foreground" },
  high:   { label: "High",   className: "text-amber-600 font-medium" },
  urgent: { label: "Urgent", className: "text-rose-600 font-semibold" },
};

export const DEPARTMENTS_ALL: InboxDepartment[] = [
  "Board of Directors", "Manager", "Director of Football", "Finance",
  "Commercial", "Head Scout", "Medical", "Groundskeeper",
  "Fan Liaison", "Sponsors", "League", "Media", "Club",
];
