import { useCallback, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useActionData, useNavigate, useSubmit } from "@remix-run/react";
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
  Checkbox,
  InlineStack,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useTranslation } from "../i18n/i18nContext";
import { LanguageToggle } from "../i18n/LanguageToggle";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const collectionId = formData.get("collectionId") as string;
  const collectionTitle = formData.get("collectionTitle") as string;
  const schedule = formData.get("schedule") as string;
  const scheduleTime = formData.get("scheduleTime") as string;
  const scheduleDayStr = formData.get("scheduleDay") as string | null;
  const slackWebhookUrl = formData.get("slackWebhookUrl") as string;
  const validFrom = formData.get("validFrom") as string | null;
  const validUntil = formData.get("validUntil") as string | null;

  if (!collectionId || !collectionTitle) {
    return json({ error: "Please select a collection" }, { status: 400 });
  }

  if (!schedule || !scheduleTime) {
    return json(
      { error: "Please configure schedule settings" },
      { status: 400 },
    );
  }

  const scheduleDay = scheduleDayStr ? parseInt(scheduleDayStr, 10) : null;

  await prisma.reportConfig.create({
    data: {
      shop: session.shop,
      collectionId,
      collectionTitle,
      schedule,
      scheduleTime,
      scheduleDay,
      slackWebhookUrl: slackWebhookUrl || null,
      validFrom: validFrom ? new Date(validFrom) : null,
      validUntil: validUntil ? new Date(validUntil) : null,
    },
  });

  return redirect("/app");
};

export default function NewReport() {
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();
  const submit = useSubmit();
  const { t } = useTranslation();

  const [collectionId, setCollectionId] = useState("");
  const [collectionTitle, setCollectionTitle] = useState("");
  const [schedule, setSchedule] = useState("daily");
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [scheduleDay, setScheduleDay] = useState("1");
  const [slackWebhookUrl, setSlackWebhookUrl] = useState("");
  const [useValidFrom, setUseValidFrom] = useState(false);
  const [useValidUntil, setUseValidUntil] = useState(false);
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");

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
    if (useValidFrom && validFrom) {
      formData.set("validFrom", validFrom);
    }
    if (useValidUntil && validUntil) {
      formData.set("validUntil", validUntil);
    }
    submit(formData, { method: "post" });
  };

  return (
    <Page
      backAction={{ content: t("common.reports"), onAction: () => navigate("/app") }}
      title={t("newReport.title")}
    >
      <TitleBar title={t("newReport.title")} />
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
                    {collectionTitle || t("reportForm.selectCollection")}
                  </Button>
                  {collectionTitle && (
                    <Text as="span" variant="bodyMd">
                      {collectionTitle}
                    </Text>
                  )}
                </InlineStack>
                {actionData && "error" in actionData && (
                  <Text as="p" tone="critical">
                    {actionData.error}
                  </Text>
                )}
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
                  {t("reportForm.validityPeriodOptional")}
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

            <InlineStack align="end" gap="300">
              <Button onClick={() => navigate("/app")}>{t("common.cancel")}</Button>
              <Button variant="primary" onClick={handleSubmit}>
                {t("newReport.createReport")}
              </Button>
            </InlineStack>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
