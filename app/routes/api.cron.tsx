import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

import { unauthenticated } from "../shopify.server";
import prisma from "../db.server";
import { shouldRunNow } from "../services/scheduler.server";
import { generateReport } from "../services/report-generator.server";
import { sendSlackReport } from "../services/slack-sender.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  // Verify Bearer token
  const authHeader = request.headers.get("Authorization");
  const expectedToken = process.env.CRON_SECRET;

  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const configs = await prisma.reportConfig.findMany({
    where: { isActive: true },
  });

  const results: Array<{
    configId: string;
    shop: string;
    status: string;
    error?: string;
  }> = [];

  for (const config of configs) {
    if (!shouldRunNow(config, now)) continue;
    if (!config.slackWebhookUrl) continue;

    try {
      // Get admin API access for this shop
      const { admin } = await unauthenticated.admin(config.shop);

      const reportData = await generateReport(
        admin,
        config.collectionId,
        config.collectionTitle,
      );

      await sendSlackReport(config.slackWebhookUrl, reportData);

      await prisma.reportConfig.update({
        where: { id: config.id },
        data: { lastSentAt: now },
      });

      await prisma.reportLog.create({
        data: {
          configId: config.id,
          status: "success",
          sentTo: "slack",
        },
      });

      results.push({
        configId: config.id,
        shop: config.shop,
        status: "success",
      });
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error";

      await prisma.reportLog.create({
        data: {
          configId: config.id,
          status: "failed",
          sentTo: "slack",
          errorMsg,
        },
      });

      results.push({
        configId: config.id,
        shop: config.shop,
        status: "failed",
        error: errorMsg,
      });
    }
  }

  return json({
    processed: results.length,
    results,
    timestamp: now.toISOString(),
  });
};
