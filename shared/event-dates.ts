const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * Calendar dates on event cards are inclusive, using UTC consistently across
 * visitors. A month-only endpoint lasts through the final day of that month.
 * Supports "Aug 30 – 31, 2026", "Oct 15 – Nov 4, 2026",
 * "December 2026" and "Dec 2026 – Jan 2027".
 */
export function eventEndTimestamp(label: string): number | null {
  const parts = label.trim().split(/\s+[–—-]\s+/);
  const end = parts[parts.length - 1].replace(/,/g, "").trim();
  const yearMatch = end.match(/\b(\d{4})$/);
  const monthMatch = end.match(/^([A-Za-z]+)/) ?? parts[0].match(/^([A-Za-z]+)/);
  if (!yearMatch || !monthMatch) return null;
  const year = Number(yearMatch[1]);
  const month = MONTHS.indexOf(monthMatch[1].slice(0, 3).toLowerCase());
  if (month < 0) return null;
  const beforeYear = end.slice(0, yearMatch.index).trim();
  const dayMatch = beforeYear.match(/\b(\d{1,2})$/);
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = dayMatch ? Number(dayMatch[1]) : lastDay;
  if (day < 1 || day > lastDay) return null;
  return Date.UTC(year, month, day, 23, 59, 59, 999);
}

export function eventHasNotEnded(label: string, now = new Date()): boolean {
  const end = eventEndTimestamp(label);
  return end !== null && end >= now.getTime();
}
