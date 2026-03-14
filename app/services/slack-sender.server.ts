export interface CollectionReportData {
  collectionTitle: string;
  period: { from: string; to: string };
  summary: {
    totalRevenue: number;
    totalOrders: number;
    totalUnitsSold: number;
    averageOrderValue: number;
  };
  topProducts: Array<{
    title: string;
    unitsSold: number;
    revenue: number;
    currentInventory: number;
  }>;
  lowStockProducts: Array<{
    title: string;
    currentInventory: number;
    variantTitle: string;
  }>;
}

function formatCurrency(amount: number): string {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

function buildSlackBlocks(data: CollectionReportData) {
  const blocks: unknown[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `Collection Report: ${data.collectionTitle}`,
      },
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Period:*\n${data.period.from} - ${data.period.to}`,
        },
        {
          type: "mrkdwn",
          text: `*Total Revenue:*\n${formatCurrency(data.summary.totalRevenue)}`,
        },
        {
          type: "mrkdwn",
          text: `*Orders:*\n${data.summary.totalOrders}`,
        },
        {
          type: "mrkdwn",
          text: `*Avg Order Value:*\n${formatCurrency(data.summary.averageOrderValue)}`,
        },
      ],
    },
    { type: "divider" },
  ];

  if (data.topProducts.length > 0) {
    const topProductLines = data.topProducts
      .slice(0, 3)
      .map(
        (p, i) =>
          `${i + 1}. *${p.title}* - ${p.unitsSold} units / ${formatCurrency(p.revenue)} (stock: ${p.currentInventory})`,
      )
      .join("\n");

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Top Products:*\n${topProductLines}`,
      },
    });
  }

  if (data.lowStockProducts.length > 0) {
    const lowStockLines = data.lowStockProducts
      .map(
        (p) =>
          `- ${p.title} (${p.variantTitle}): ${p.currentInventory} remaining`,
      )
      .join("\n");

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Low Stock Alert:*\n${lowStockLines}`,
      },
    });
  }

  return blocks;
}

export async function sendSlackReport(
  webhookUrl: string,
  data: CollectionReportData,
): Promise<void> {
  const blocks = buildSlackBlocks(data);

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blocks }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Slack webhook failed (${response.status}): ${text}`);
  }
}

export { buildSlackBlocks };
