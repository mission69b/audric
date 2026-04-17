// Shared cron-expression formatter for Copilot surfaces (dashboard card,
// confirm screen, digest email). Single source of truth — every Copilot
// surface that renders a cadence must import from here so we never drift.

export function formatCron(expr: string): string {
  // Parses standard 5-field cron (minute hour dom month dow) for the detector
  // patterns we emit (every-day, every-Nth-day-of-week, monthly).
  // Falls back to the raw expression for anything that doesn't match — better
  // surfacing a known-weird string than a misleading translation.
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;
  const [minStr, hourStr, dom, month, dow] = parts;
  const min = parseInt(minStr, 10);
  const hour = parseInt(hourStr, 10);
  if (Number.isNaN(min) || Number.isNaN(hour)) return expr;

  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const time = formatTime(hour, min);

  if (month !== "*") return expr;

  // Daily: 0 9 * * *
  if (dom === "*" && dow === "*") {
    return time === "midnight" ? "every day" : `every day at ${time}`;
  }
  // Monthly on day-of-month: 0 0 1 * *
  if (dom !== "*" && dow === "*") {
    const dn = parseInt(dom, 10);
    if (!Number.isNaN(dn)) {
      return time === "midnight"
        ? `monthly on the ${ordinal(dn)}`
        : `monthly on the ${ordinal(dn)} at ${time}`;
    }
  }
  // Weekly on day-of-week: 0 9 * * 1
  if (dom === "*" && dow !== "*") {
    const dn = parseInt(dow, 10);
    if (!Number.isNaN(dn) && days[dn]) {
      return time === "midnight"
        ? `every ${days[dn]}`
        : `every ${days[dn]} at ${time}`;
    }
  }
  return expr;
}

function formatTime(hour: number, min: number): string {
  if (hour === 0 && min === 0) return "midnight";
  if (hour === 12 && min === 0) return "noon";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const ampm = hour < 12 ? "am" : "pm";
  return min === 0 ? `${h12}${ampm}` : `${h12}:${String(min).padStart(2, "0")}${ampm}`;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
