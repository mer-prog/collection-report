import { useEffect } from "react";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  useActionData,
  useLoaderData,
  useNavigate,
  useSubmit,
} from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Badge,
  IndexTable,
  Button,
  EmptyState,
  InlineStack,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getReportStatus } from "../services/scheduler.server";
import { generateReport } from "../services/report-generator.server";
import { sendSlackReport } from "../services/slack-sender.server";
import { useTranslation, useTranslationArray } from "../i18n/i18nContext";
import { LanguageToggle } from "../i18n/LanguageToggle";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const configs = await prisma.reportConfig.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
    include: {
      reports: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  const reports = configs.map((config) => ({
    ...config,
    status: getReportStatus(config),
    validFrom: config.validFrom?.toISOString() ?? null,
    validUntil: config.validUntil?.toISOString() ?? null,
    lastSentAt: config.lastSentAt?.toISOString() ?? null,
    createdAt: config.createdAt.toISOString(),
    reports: config.reports.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })),
  }));

  return json({ reports });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const configId = formData.get("configId") as string;

  if (intent === "sendNow") {
    const config = await prisma.reportConfig.findFirst({
      where: { id: configId, shop: session.shop },
    });

    if (!config) {
      return json({ error: "Report config not found" }, { status: 404 });
    }

    if (!config.slackWebhookUrl) {
      return json(
        { error: "Slack Webhook URL is not configured" },
        { status: 400 },
      );
    }

    try {
      const reportData = await generateReport(
        admin,
        config.collectionId,
        config.collectionTitle,
      );

      await sendSlackReport(config.slackWebhookUrl, reportData);

      await prisma.reportConfig.update({
        where: { id: configId },
        data: { lastSentAt: new Date() },
      });

      await prisma.reportLog.create({
        data: {
          configId,
          status: "success",
          sentTo: "slack",
        },
      });

      return json({ success: true, configId });
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error";

      await prisma.reportLog.create({
        data: {
          configId,
          status: "failed",
          sentTo: "slack",
          errorMsg,
        },
      });

      return json({ error: errorMsg }, { status: 500 });
    }
  }

  if (intent === "delete") {
    await prisma.reportConfig.delete({
      where: { id: configId, shop: session.shop },
    });

    return json({ deleted: true });
  }

  if (intent === "toggleActive") {
    const config = await prisma.reportConfig.findFirst({
      where: { id: configId, shop: session.shop },
    });

    if (config) {
      await prisma.reportConfig.update({
        where: { id: configId },
        data: { isActive: !config.isActive },
      });
    }

    return json({ toggled: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

type StatusTone = "success" | "info" | "warning" | "critical" | undefined;

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const toneMap: Record<string, StatusTone> = {
    active: "success",
    pending: "info",
    expired: "warning",
    inactive: "critical",
  };
  const tone = toneMap[status] ?? undefined;
  const label = t(`status.${status}`);
  return <Badge tone={tone}>{label}</Badge>;
}

function ScheduleLabel({ schedule, day }: { schedule: string; day: number | null }) {
  const { t } = useTranslation();
  const dayAbbreviations = useTranslationArray("schedule.dayAbbreviations");

  switch (schedule) {
    case "daily":
      return <>{t("schedule.daily")}</>;
    case "weekly":
      return <>{t("schedule.weeklyFormat", { day: dayAbbreviations[day ?? 0] })}</>;
    case "monthly":
      return <>{t("schedule.monthlyFormat", { day: String(day ?? 1) })}</>;
    default:
      return <>{schedule}</>;
  }
}

export default function Dashboard() {
  const { reports } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();
  const submit = useSubmit();
  const { t, locale } = useTranslation();

  useEffect(() => {
    if (actionData && "error" in actionData) {
      shopify.toast.show(actionData.error as string, { isError: true });
    }
    if (actionData && "success" in actionData) {
      shopify.toast.show(t("dashboard.sendSuccess"));
    }
    if (actionData && "deleted" in actionData) {
      shopify.toast.show(t("dashboard.deleteSuccess"));
    }
  }, [actionData, t]);

  const handleSendNow = (configId: string) => {
    submit({ intent: "sendNow", configId }, { method: "post" });
  };

  const handleDelete = (configId: string) => {
    submit({ intent: "delete", configId }, { method: "post" });
  };

  const resourceName = {
    singular: t("dashboard.resourceSingular"),
    plural: t("dashboard.resourcePlural"),
  };

  const rowMarkup = reports.map((report, index) => (
    <IndexTable.Row
      id={report.id}
      key={report.id}
      position={index}
      onClick={() => navigate(`/app/reports/${report.id}`)}
    >
      <IndexTable.Cell>
        <Text variant="bodyMd" fontWeight="bold" as="span">
          {report.collectionTitle}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <StatusBadge status={report.status} />
      </IndexTable.Cell>
      <IndexTable.Cell>
        <ScheduleLabel schedule={report.schedule} day={report.scheduleDay} /> {report.scheduleTime}
      </IndexTable.Cell>
      <IndexTable.Cell>
        {report.validFrom
          ? `${report.validFrom.split("T")[0]} ~ ${report.validUntil?.split("T")[0] ?? ""}`
          : t("common.noLimit")}
      </IndexTable.Cell>
      <IndexTable.Cell>
        {report.lastSentAt
          ? new Date(report.lastSentAt).toLocaleString(
              locale === "ja" ? "ja-JP" : "en-US",
            )
          : "-"}
      </IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="200">
          <Button
            size="slim"
            onClick={() => handleSendNow(report.id)}
          >
            {t("dashboard.sendNow")}
          </Button>
          <Button
            size="slim"
            tone="critical"
            onClick={() => handleDelete(report.id)}
          >
            {t("common.delete")}
          </Button>
        </InlineStack>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page>
      <TitleBar title={t("dashboard.title")}>
        <button
          variant="primary"
          onClick={() => navigate("/app/reports/new")}
        >
          {t("dashboard.newReport")}
        </button>
      </TitleBar>
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <InlineStack align="end">
              <LanguageToggle />
            </InlineStack>
            <Card padding="0">
              {reports.length === 0 ? (
                <EmptyState
                  heading={t("dashboard.emptyHeading")}
                  action={{
                    content: t("dashboard.createReport"),
                    onAction: () => navigate("/app/reports/new"),
                  }}
                  image=""
                >
                  <p>
                    {t("dashboard.emptyDescription")}
                  </p>
                </EmptyState>
              ) : (
                <BlockStack>
                  <IndexTable
                    resourceName={resourceName}
                    itemCount={reports.length}
                    headings={[
                      { title: t("dashboard.headingCollection") },
                      { title: t("dashboard.headingStatus") },
                      { title: t("dashboard.headingSchedule") },
                      { title: t("dashboard.headingPeriod") },
                      { title: t("dashboard.headingLastSent") },
                      { title: t("dashboard.headingActions") },
                    ]}
                    selectable={false}
                  >
                    {rowMarkup}
                  </IndexTable>
                </BlockStack>
              )}
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
