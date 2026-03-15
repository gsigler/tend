// Display formatting utilities

/** Convert snake_case to Title Case: "raised_bed" → "Raised Bed" */
export function humanize(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

/** Format a date string showing relative days: "2026-03-01" → "Mar 1 (14d ago)" */
export function relativeDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffMs = target.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  const month = date.toLocaleString("en-US", { month: "short" });
  const day = date.getDate();
  const base = `${month} ${day}`;

  if (diffDays === 0) return `${base} (today)`;
  if (diffDays === 1) return `${base} (tomorrow)`;
  if (diffDays === -1) return `${base} (yesterday)`;
  if (diffDays < 0) return `${base} (${Math.abs(diffDays)}d overdue)`;
  if (diffDays <= 7) return `${base} (in ${diffDays}d)`;
  return base;
}

/** Just the short date: "2026-03-15" → "Mar 15" */
export function shortDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const month = date.toLocaleString("en-US", { month: "short" });
  return `${month} ${date.getDate()}`;
}

/** Right-pad a string to width */
export function pad(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

/** Left-pad a number with spaces */
export function numPad(n: number, width: number): string {
  const s = String(n);
  return s.length >= width ? s : " ".repeat(width - s.length) + s;
}

/** Priority indicator */
export function priorityIcon(p: string): string {
  switch (p) {
    case "high": return "!!!";
    case "medium": return " !!";
    case "low": return "  !";
    default: return "   ";
  }
}

/** Crop display name with optional variety */
export function cropName(crop: string, variety?: string | null): string {
  return variety ? `${crop} (${variety})` : crop;
}

/** Format a section header */
export function header(title: string): string {
  return `\n${title}\n${"─".repeat(title.length)}`;
}
