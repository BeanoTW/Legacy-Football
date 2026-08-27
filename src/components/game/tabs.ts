import {
  Briefcase,
  Building2,
  Calendar,
  CircleDollarSign,
  Gavel,
  Globe2,
  Handshake,
  Home,
  LineChart as LineIcon,
  Mail,
  MoreHorizontal,
  Save,
  Settings,
  Ticket,
  Trophy,
  Users,
} from "lucide-react";

export type Tab =
  | "inbox"
  | "hub"
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
  ["recruitment", "Transfers", Users],
  ["staff", "Staff", Briefcase],
  ["cashflow", "Finances", CircleDollarSign],
  ["stadium", "Facilities", Building2],
  ["fixtures", "Matches", Calendar],
  ["board", "Board", Gavel],
  ["commercial", "Commercial", Handshake],
  ["tickets", "Tickets", Ticket],
  ["dashboard", "Reports", LineIcon],
  ["leagues", "Leagues", Trophy],
  ["world", "World", Globe2],
  ["history", "Ledger", Save],
  ["settings", "Settings", Settings],
];

/** The five things a chairman should be able to reach without hunting. */
export const PRIMARY_TAB_IDS: Tab[] = ["hub", "inbox", "recruitment", "cashflow"];

/** Desktop keeps the same low-cognitive-load core and moves detail behind More. */
export const DESKTOP_PRIMARY_TAB_IDS: Tab[] = [
  "hub",
  "inbox",
  "recruitment",
  "cashflow",
  "staff",
  "stadium",
];

export const MORE_ICON = MoreHorizontal;
