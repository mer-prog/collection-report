import { useCallback, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useActionData, useLoaderData, useNavigate, useSubmit } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  FormLayout,
  TextField,
  Select,
  Button,
  BlockStack,
  Text,
  Badge,
  Checkbox,
  InlineStack,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getReportStatus } from "../services/scheduler.server";
import { useTranslation } from "../i18n/i18nContext";
import { LanguageToggle } from "../i18n/LanguageToggle";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { id } = params;

  const config = await prisma.reportConfig.findFirst({
    where: { id, shop: session.shop },
    include: {
      reports: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });

  if (!config) {
    throw new Response("Not found", { status: 404 });
  }

  return json({
    config: {
      ...config,
      status: getReportStatus(config),
      validFrom: config.validFrom?.toISOString().split("T")[0] ?? "",
      validUntil: config.validUntil?.toISOString().split("T")[0] ?? "",
      lastSentAt: config.lastSentAt?.toISOString() ?? null,
      createdAt: config.createdAt.toISOString(),
      reports: config.reports.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
      })),
    },
  });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { id } = params;
  const formData = await request.formData();

  const config = await prisma.reportConfig.findFirst({
    where: { id, shop: session.shop },
  });

  if (!config) {
    return json({ error: "Not found" }, { status: 404 });
  }

  const collectionId = formData.get("collectionId") as string;
  const collectionTitle = formData.get("collectionTitle") as string;
  const schedule = formData.get("schedule") as string;
  const scheduleTime = formData.get("scheduleTime") as string;
  const scheduleDayStr = formData.get("scheduleDay") as string | null;
  const slackWebhookUrl = formData.get("slackWebhookUrl") as string;
  const validFrom = formData.get("validFrom") as string | null;
  const validUntil = formData.get("validUntil") as string | null;
  const isActive = formData.get("isActive") === "true";

  const scheduleDay = scheduleDayStr ? parseInt(scheduleDayStr, 10) : null;

  await prisma.reportConfig.update({
    where: { id },
    data: {
      collectionId: collectionId || config.collectionId,
      collectionTitle: collectionTitle || config.collectionTitle,
      schedule,
      scheduleTime,
      scheduleDay,
      slackWebhookUrl: slackWebhookUrl || null,
      isActive,
      validFrom: validFrom ? new Date(validFrom) : null,
      validUntil: validUntil ? new Date(validUntil) : null,
    },
  });

  return redirect("/app");
};

export default function EditReport() {
  const { config } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();
  const submit = useSubmit();
  const { t, locale } = useTranslation();

  const [collectionId, setCollectionId] = useState(config.collectionId);
  const [collectionTitle, setCollectionTitle] = useState(config.collectionTitle);
  const [schedule, setSchedule] = useState(config.schedule);
  const [scheduleTime, setScheduleTime] = useState(config.scheduleTime);
  const [scheduleDay, setScheduleDay] = useState(
    String(config.scheduleDay ?? "1"),
  );
  const [slackWebhookUrl, setSlackWebhookUrl] = useState(
    config.slackWebhookUrl ?? "",
  );
  const [isActive, setIsActive] = useState(config.isActive);
  const [validFrom, setValidFrom] = useState(config.validFrom);
  const [validUntil, setValidUntil] = useState(config.validUntil);
  const [useValidFrom, setUseValidFrom] = useState(!!config.validFrom);
  const [useValidUntil, setUseValidUntil] = useState(!!config.validUntil);

  const scheduleOptions = [
    { label: t("schedule.daily"), value: "daily" },
    { label: t("schedule.weekly"), value: "weekly" },
    { label: t("schedule.monthly"), value: "monthly" },
  ];

  const dayOfWeekOptions = [
    { label: t("schedule.sunday"), value: "0" },
    { label: t("schedule.monday"), value: "1" },
    { label: t("schedule.tuesday"), value: "2" },
    { label: t("schedule.wednesday"), value: "3" },
    { label: t("schedule.thursday"), value: "4" },
    { label: t("schedule.friday"), value: "5" },
    { label: t("schedule.saturday"), value: "6" },
  ];

  const handleCollectionPicker = useCallback(async () => {
    const selection = await shopify.resourcePicker({
      type: "collection",
      multiple: false,
    });

    if (selection && selection.length > 0) {
      const selected = selection[0];
      setCollectionId(selected.id);
      setCollectionTitle(selected.title);
    }
  }, []);

  const handleSubmit = () => {
    const formData = new FormData();
    formData.set("collectionId", collectionId);
    formData.set("collectionTitle", collectionTitle);
    formData.set("schedule", schedule);
    formData.set("scheduleTime", scheduleTime);
    if (schedule === "weekly" || schedule === "monthly") {
      formData.set("scheduleDay", scheduleDay);
    }
    formData.set("slackWebhookUrl", slackWebhookUrl);
    formData.set("isActive", String(isActive));
    if (useValidFrom && validFrom) {
      formData.set("validFrom", validFrom);
    }
    if (useValidUntil && validUntil) {
      formData.set("validUntil", validUntil);
    }
    submit(formData, { method: "post" });
  };

  const statusToneMap: Record<string, "success" | "info" | "warning" | "critical"> = {
    active: "success",
    pending: "info",
    expired: "warning",
    inactive: "critical",
  };

  return (
    <Page
      backAction={{ content: t("common.reports"), onAction: () => navigate("/app") }}
      title={`${t("editReport.editPrefix")}${config.collectionTitle}`}
      titleMetadata={
        <Badge tone={statusToneMap[config.status]}>
          {t(`status.${config.status}`)}
        </Badge>
      }
    >
      <TitleBar title={t("editReport.title")} />
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <InlineStack align="end">
              <LanguageToggle />
            </InlineStack>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  {t("reportForm.collection")}
                </Text>
                <InlineStack gap="300" blockAlign="center">
                  <Button onClick={handleCollectionPicker}>
                    {t("reportForm.changeCollection")}
                  </Button>
                  <Text as="span" variant="bodyMd">
                    {collectionTitle}
                  </Text>
                </InlineStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  {t("reportForm.schedule")}
                </Text>
                <FormLayout>
                  <Select
                    label={t("schedule.frequency")}
                    options={scheduleOptions}
                    value={schedule}
                    onChange={setSchedule}
                  />
                  {schedule === "weekly" && (
                    <Select
                      label={t("schedule.dayOfWeek")}
                      options={dayOfWeekOptions}
                      value={scheduleDay}
                      onChange={setScheduleDay}
                    />
                  )}
                  {schedule === "monthly" && (
                    <TextField
                      label={t("schedule.dayOfMonth")}
                      type="number"
                      value={scheduleDay}
                      onChange={setScheduleDay}
                      min={1}
                      max={31}
                      autoComplete="off"
                    />
                  )}
                  <TextField
                    label={t("schedule.sendTime")}
                    type="time"
                    value={scheduleTime}
                    onChange={setScheduleTime}
                    autoComplete="off"
                  />
                </FormLayout>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  {t("reportForm.validityPeriod")}
                </Text>
                <FormLayout>
                  <Checkbox
                    label={t("reportForm.setStartDate")}
                    checked={useValidFrom}
                    onChange={setUseValidFrom}
                  />
                  {useValidFrom && (
                    <TextField
                      label={t("reportForm.startDate")}
                      type="date"
                      value={validFrom}
                      onChange={setValidFrom}
                      autoComplete="off"
                    />
                  )}
                  <Checkbox
                    label={t("reportForm.setEndDate")}
                    checked={useValidUntil}
                    onChange={setUseValidUntil}
                  />
                  {useValidUntil && (
                    <TextField
                      label={t("reportForm.endDate")}
                      type="date"
                      value={validUntil}
                      onChange={setValidUntil}
                      autoComplete="off"
                    />
                  )}
                </FormLayout>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  {t("reportForm.slackDestination")}
                </Text>
                <TextField
                  label={t("reportForm.slackWebhookUrl")}
                  value={slackWebhookUrl}
                  onChange={setSlackWebhookUrl}
                  placeholder="https://hooks.slack.com/services/..."
                  autoComplete="off"
                />
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  {t("reportForm.statusLabel")}
                </Text>
                <Checkbox
                  label={t("reportForm.activeLabel")}
                  checked={isActive}
                  onChange={setIsActive}
                />
              </BlockStack>
            </Card>

            {config.reports.length > 0 && (
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    {t("reportForm.recentLogs")}
                  </Text>
                  {config.reports.map((log) => (
                    <InlineStack key={log.id} gap="300">
                      <Badge
                        tone={
                          log.status === "success" ? "success" : "critical"
                        }
                      >
                        {log.status}
                      </Badge>
                      <Text as="span" variant="bodyMd">
                        {new Date(log.createdAt).toLocaleString(
                          locale === "ja" ? "ja-JP" : "en-US",
                        )} -
                        {log.sentTo}
                      </Text>
                      {log.errorMsg && (
                        <Text as="span" tone="critical">
                          {log.errorMsg}
                        </Text>
                      )}
                    </InlineStack>
                  ))}
                </BlockStack>
              </Card>
            )}

            {actionData && "error" in actionData && (
              <Text as="p" tone="critical">
                {actionData.error}
              </Text>
            )}

            <InlineStack align="end" gap="300">
              <Button
                onClick={() =>
                  navigate(`/app/reports/${config.id}/preview`)
                }
              >
                {t("common.preview")}
              </Button>
              <Button onClick={() => navigate("/app")}>{t("common.cancel")}</Button>
              <Button variant="primary" onClick={handleSubmit}>
                {t("common.save")}
              </Button>
            </InlineStack>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
