-- CreateTable
CREATE TABLE "ReportConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "collectionTitle" TEXT NOT NULL,
    "schedule" TEXT NOT NULL,
    "scheduleTime" TEXT NOT NULL,
    "scheduleDay" INTEGER,
    "slackWebhookUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" DATETIME,
    "validUntil" DATETIME,
    "lastSentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ReportLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "configId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sentTo" TEXT NOT NULL,
    "errorMsg" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReportLog_configId_fkey" FOREIGN KEY ("configId") REFERENCES "ReportConfig" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
