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
import { useTranslation } from "../i18n/i18nContext";
import { LanguageToggle } from "../i18n/LanguageToggle";

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
  return `\u00a5${amount.toLocaleString("ja-JP")}`;
}

function ReportPreviewContent({ data }: { data: CollectionReportData }) {
  const { t } = useTranslation();

  return (
    <BlockStack gap="400">
      <Box
        background="bg-surface-secondary"
        padding="400"
        borderRadius="200"
      >
        <BlockStack gap="400">
          <Text as="h2" variant="headingLg">
            {t("previewReport.collectionReportTitle", { title: data.collectionTitle })}
          </Text>

          <InlineStack gap="800">
            <BlockStack gap="100">
              <Text as="span" variant="bodySm" tone="subdued">
                {t("previewReport.period")}
              </Text>
              <Text as="span" variant="bodyMd">
                {data.period.from} - {data.period.to}
              </Text>
            </BlockStack>
            <BlockStack gap="100">
              <Text as="span" variant="bodySm" tone="subdued">
                {t("previewReport.totalRevenue")}
              </Text>
              <Text as="span" variant="headingMd">
                {formatCurrency(data.summary.totalRevenue)}
              </Text>
            </BlockStack>
            <BlockStack gap="100">
              <Text as="span" variant="bodySm" tone="subdued">
                {t("previewReport.orders")}
              </Text>
              <Text as="span" variant="headingMd">
                {data.summary.totalOrders}
              </Text>
            </BlockStack>
            <BlockStack gap="100">
              <Text as="span" variant="bodySm" tone="subdued">
                {t("previewReport.avgOrderValue")}
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
                {t("previewReport.topProducts")}
              </Text>
              {data.topProducts.slice(0, 3).map((product, i) => (
                <InlineStack key={i} gap="300" blockAlign="center">
                  <Badge>{`#${i + 1}`}</Badge>
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    {product.title}
                  </Text>
                  <Text as="span" variant="bodyMd">
                    {product.unitsSold} {t("previewReport.units")} / {formatCurrency(product.revenue)}
                  </Text>
                  <Text as="span" variant="bodySm" tone="subdued">
                    {t("previewReport.stock")}{product.currentInventory}
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
                  {t("previewReport.lowStockAlert")}
                </Text>
                {data.lowStockProducts.map((product, i) => (
                  <InlineStack key={i} gap="300">
                    <Badge tone="warning">{t("previewReport.lowBadge")}</Badge>
                    <Text as="span" variant="bodyMd">
                      {product.title} ({product.variantTitle})
                    </Text>
                    <Text as="span" variant="bodyMd" tone="critical">
                      {t("previewReport.remaining", { count: product.currentInventory })}
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
  const { t } = useTranslation();

  return (
    <Page
      backAction={{
        content: t("previewReport.backToEdit"),
        onAction: () => navigate(`/app/reports/${configId}`),
      }}
      title={t("previewReport.title")}
    >
      <TitleBar title={t("previewReport.title")} />
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <InlineStack align="end">
              <LanguageToggle />
            </InlineStack>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  {t("previewReport.slackPreviewTitle")}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {t("previewReport.slackPreviewDescription")}
                </Text>
                <ReportPreviewContent data={reportData} />
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
