import type { ReportConfig } from "@prisma/client";

export function shouldRunNow(config: ReportConfig, now: Date): boolean {
  // Check validity period
  if (config.validFrom && now < config.validFrom) return false;
  if (config.validUntil && now > config.validUntil) return false;
  if (!config.isActive) return false;

  const [targetHour, targetMinute] = config.scheduleTime.split(":").map(Number);
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  // Check if within the schedule time window (within 30 min to allow cron drift)
  const targetMinutes = targetHour * 60 + targetMinute;
  const currentMinutes = currentHour * 60 + currentMinute;
  if (Math.abs(currentMinutes - targetMinutes) > 30) return false;

  // Check if already sent today (prevent duplicate sends)
  if (config.lastSentAt) {
    const lastSent = new Date(config.lastSentAt);
    if (
      lastSent.getFullYear() === now.getFullYear() &&
      lastSent.getMonth() === now.getMonth() &&
      lastSent.getDate() === now.getDate()
    ) {
      return false;
    }
  }

  switch (config.schedule) {
    case "daily":
      return true;
    case "weekly":
      return config.scheduleDay === now.getDay();
    case "monthly":
      return config.scheduleDay === now.getDate();
    default:
      return false;
  }
}

export type ReportStatus = "active" | "pending" | "expired" | "inactive";

export function getReportStatus(config: ReportConfig): ReportStatus {
  if (!config.isActive) return "inactive";

  const now = new Date();
  if (config.validFrom && now < config.validFrom) return "pending";
  if (config.validUntil && now > config.validUntil) return "expired";

  return "active";
}
