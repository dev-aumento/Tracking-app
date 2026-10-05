import { startOfWorkZoneDay } from "@/lib/timezone";

/** Last instant of a notice period that starts today and lasts `days` calendar days. */
export function noticePeriodEndsAt(days: number, from: Date = new Date()): Date {
  const safeDays = Number.isFinite(days) && days > 0 ? Math.floor(days) : 0;
  const start = startOfWorkZoneDay(from);
  return new Date(start.getTime() + safeDays * 86_400_000);
}
