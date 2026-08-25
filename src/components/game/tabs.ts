import {
  Briefcase,
  Building2,
  Calendar,
  CircleDollarSign,
  Gavel,
  Globe2,
  Handshake,
  LineChart as LineIcon,
  Mail,
  Save,
  Ticket,
  Trophy,
  UserRoundSearch,
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
  | "transfers"
  | "staff"
  | "stadium"
  | "fixtures"
  | "leagues"
  | "world"
  | "history";

export type TabDef = [Tab, string, typeof LineIcon];

export const ALL_TABS: TabDef[] = [
  ["inbox", "Inbox", Mail],
  ["hub", "Home", Trophy],
  ["board", "Board", Gavel],
  ["commercial", "Commercial", Handshake],
  ["dashboard", "Reports", LineIcon],
  ["cashflow", "Finances", CircleDollarSign],
  ["tickets", "Tickets", Ticket],
  ["recruitment", "Squad", Users],
  ["transfers", "Transfers", UserRoundSearch],
  ["staff", "Staff", Briefcase],
  ["stadium", "Stadium", Building2],
  ["fixtures", "Matches", Calendar],
  ["leagues", "Leagues", Trophy],
  ["world", "World", Globe2],
  ["history", "Records", Save],
];

export const PRIMARY_TAB_IDS: Tab[] = ["hub", "inbox", "transfers", "fixtures"];

export const DESKTOP_TAB_GROUPS: { label: string; tabs: Tab[] }[] = [
  { label: "Football", tabs: ["recruitment", "staff", "fixtures", "leagues"] },
  { label: "Club", tabs: ["board", "cashflow", "tickets", "stadium", "commercial"] },
  { label: "More", tabs: ["dashboard", "world", "history"] },
];
