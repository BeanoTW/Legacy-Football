import {
  Briefcase,
  Building2,
  Calendar,
  CircleDollarSign,
  Gavel,
  Handshake,
  Home,
  LineChart as LineIcon,
  Mail,
  MoreHorizontal,
  History,
  Settings,
  Shirt,
  Ticket,
  Trophy,
  ArrowLeftRight,
} from "lucide-react";

export type Tab =
  | "inbox"
  | "hub"
  | "squad"
  | "board"
  | "commercial"
  | "dashboard"
  | "cashflow"
  | "tickets"
  | "recruitment"
  | "staff"
  | "stadium"
  | "fixtures"
  | "leagues"
  | "world"
  | "history"
  | "settings";

export type TabDef = [Tab, string, typeof LineIcon];

export const ALL_TABS: TabDef[] = [
  ["hub", "Home", Home],
  ["inbox", "Inbox", Mail],
  ["squad", "Squad", Shirt],
  ["recruitment", "Transfers", ArrowLeftRight],
  ["staff", "Staff", Briefcase],
  ["cashflow", "Finances", CircleDollarSign],
  ["stadium", "Facilities", Building2],
  ["fixtures", "Matches", Calendar],
  ["board", "Board", Gavel],
  ["commercial", "Commercial", Handshake],
  ["tickets", "Tickets", Ticket],
  ["dashboard", "Reports", LineIcon],
  ["world", "Competitions", Trophy],
  ["history", "Legacy", History],
  ["settings", "Settings", Settings],
];

/** The four football-chairman areas that deserve permanent mobile access. */
export const PRIMARY_TAB_IDS: Tab[] = ["hub", "inbox", "squad", "recruitment", "stadium"];

/** Finance remains easy to reach through More; squad is more immediate day-to-day. */
export const DESKTOP_PRIMARY_TAB_IDS: Tab[] = [
  "hub",
  "inbox",
  "squad",
  "recruitment",
  "staff",
  "stadium",
];

export const MORE_ICON = MoreHorizontal;
