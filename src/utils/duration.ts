export type DurationUnit = "months" | "days" | "minutes";

export function normalizeDurationUnit(value?: string): DurationUnit {
  const normalized = (value || "").toLowerCase();

  if (normalized === "days" || normalized === "day") return "days";
  if (normalized === "minutes" || normalized === "minute" || normalized === "mins" || normalized === "min") {
    return "minutes";
  }
  if (normalized === "months" || normalized === "month") return "months";

  return "months";
}

export function getDurationUnitLabel(unit: DurationUnit): string {
  switch (unit) {
    case "days":
      return "дней";
    case "minutes":
      return "минут";
    case "months":
    default:
      return "месяцев";
  }
}

export function formatDuration(value: number, unit: DurationUnit): string {
  return `${value} ${getDurationUnitLabel(unit)}`;
}

export function addDuration(start: Date, value: number, unit: DurationUnit): Date {
  const result = new Date(start);
  switch (unit) {
    case "days":
      result.setDate(result.getDate() + value);
      break;
    case "minutes":
      result.setMinutes(result.getMinutes() + value);
      break;
    case "months":
    default:
      result.setMonth(result.getMonth() + value);
      break;
  }
  return result;
}

export function durationToMonths(value: number, unit: DurationUnit): number {
  switch (unit) {
    case "days":
      return value / 30;
    case "minutes":
      return value / (30 * 24 * 60);
    case "months":
    default:
      return value;
  }
}
