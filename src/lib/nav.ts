import type { NavItem } from "@/components/app-shell";

/** Role-scoped navigation maps used by the shared AppShell. */
export const STUDENT_NAV: NavItem[] = [
  { to: "/student", label: "Dashboard" },
  { to: "/student/precheck", label: "Pre-Exam Verification" },
  { to: "/student/reports", label: "Integrity Reports" },
];

export const FACULTY_NAV: NavItem[] = [
  { to: "/faculty", label: "Live Monitoring" },
  { to: "/faculty/exams", label: "Exam Management" },
  { to: "/faculty/reports", label: "Session Reports" },
  { to: "/faculty/analytics", label: "AI Analytics" },
  { to: "/faculty/settings", label: "Proctor Settings" },
];

export const ADMIN_NAV: NavItem[] = [{ to: "/admin", label: "Administration" }];

