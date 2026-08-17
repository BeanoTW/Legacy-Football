import {
  Briefcase, Building2, Calendar, CircleDollarSign, Gavel, Handshake,
  LineChart as LineIcon, Mail, Save, Ticket, Trophy, Users,
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
  | "history";

export type TabDef = [Tab, string, typeof LineIcon];

export const ALL_TABS: TabDef[] = [
  ["inbox", "Inbox", Mail],
  ["hub", "Club", Trophy],
  ["board", "Board", Gavel],
  ["commercial", "Commercial", Handshake],
  ["dashboard", "Overview", LineIcon],
  ["cashflow", "Cash flow", CircleDollarSign],
  ["tickets", "Tickets", Ticket],
  ["recruitment", "Recruitment", Users],
  ["staff", "Staff", Briefcase],
  ["stadium", "Stadium", Building2],
  ["fixtures", "Fixtures", Calendar],
  ["leagues", "Leagues", Trophy],
  ["history", "Ledger", Save],
];

export const PRIMARY_TAB_IDS: Tab[] = ["inbox", "hub", "recruitment", "board"];
