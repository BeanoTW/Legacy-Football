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
  Shield,
  Ticket,
  Trophy,
  Users,
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
  ["squad", "Squad", Shield],
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

/** The four football-chairman areas that deserve permanent mobile access. */
export const PRIMARY_TAB_IDS: Tab[] = ["hub", "inbox", "squad", "recruitment"];

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
