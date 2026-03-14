import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Divider,
  InlineStack,
  Box,
  Badge,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { generateReport } from "../services/report-generator.server";
import type { CollectionReportData } from "../services/slack-sender.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const { id } = params;

  const config = await prisma.reportConfig.findFirst({
    where: { id, shop: session.shop },
  });

  if (!config) {
    throw new Response("Not found", { status: 404 });
  }

  const reportData = await generateReport(
    admin,
    config.collectionId,
    config.collectionTitle,
  );

  return json({ reportData, configId: config.id });
};

function formatCurrency(amount: number): string {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

function ReportPreviewContent({ data }: { data: CollectionReportData }) {
  return (
    <BlockStack gap="400">
      <Box
        background="bg-surface-secondary"
        padding="400"
        borderRadius="200"
      >
        <BlockStack gap="400">
          <Text as="h2" variant="headingLg">
            Collection Report: {data.collectionTitle}
          </Text>

          <InlineStack gap="800">
            <BlockStack gap="100">
              <Text as="span" variant="bodySm" tone="subdued">
                Period
              </Text>
              <Text as="span" variant="bodyMd">
                {data.period.from} - {data.period.to}
              </Text>
            </BlockStack>
            <BlockStack gap="100">
              <Text as="span" variant="bodySm" tone="subdued">
                Total Revenue
              </Text>
              <Text as="span" variant="headingMd">
                {formatCurrency(data.summary.totalRevenue)}
              </Text>
            </BlockStack>
            <BlockStack gap="100">
              <Text as="span" variant="bodySm" tone="subdued">
                Orders
              </Text>
              <Text as="span" variant="headingMd">
                {data.summary.totalOrders}
              </Text>
            </BlockStack>
            <BlockStack gap="100">
              <Text as="span" variant="bodySm" tone="subdued">
                Avg Order Value
              </Text>
              <Text as="span" variant="headingMd">
                {formatCurrency(data.summary.averageOrderValue)}
              </Text>
            </BlockStack>
          </InlineStack>

          <Divider />

          {data.topProducts.length > 0 && (
            <BlockStack gap="200">
              <Text as="h3" variant="headingMd">
                Top Products
              </Text>
              {data.topProducts.slice(0, 3).map((product, i) => (
                <InlineStack key={i} gap="300" blockAlign="center">
                  <Badge>{`#${i + 1}`}</Badge>
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    {product.title}
                  </Text>
                  <Text as="span" variant="bodyMd">
                    {product.unitsSold} units / {formatCurrency(product.revenue)}
                  </Text>
                  <Text as="span" variant="bodySm" tone="subdued">
                    Stock: {product.currentInventory}
                  </Text>
                </InlineStack>
              ))}
            </BlockStack>
          )}

          {data.lowStockProducts.length > 0 && (
            <>
              <Divider />
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd">
                  Low Stock Alert
                </Text>
                {data.lowStockProducts.map((product, i) => (
                  <InlineStack key={i} gap="300">
                    <Badge tone="warning">Low</Badge>
                    <Text as="span" variant="bodyMd">
                      {product.title} ({product.variantTitle})
                    </Text>
                    <Text as="span" variant="bodyMd" tone="critical">
                      {product.currentInventory} remaining
                    </Text>
                  </InlineStack>
                ))}
              </BlockStack>
            </>
          )}
        </BlockStack>
      </Box>
    </BlockStack>
  );
}

export default function PreviewReport() {
  const { reportData, configId } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  return (
    <Page
      backAction={{
        content: "Edit Report",
        onAction: () => navigate(`/app/reports/${configId}`),
      }}
      title="Report Preview"
    >
      <TitleBar title="Report Preview" />
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Slack Message Preview
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                This is how the report will appear in Slack.
              </Text>
              <ReportPreviewContent data={reportData} />
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
