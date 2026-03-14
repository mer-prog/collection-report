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

const SCHEDULE_OPTIONS = [
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
];

const DAY_OF_WEEK_OPTIONS = [
  { label: "Sunday", value: "0" },
  { label: "Monday", value: "1" },
  { label: "Tuesday", value: "2" },
  { label: "Wednesday", value: "3" },
  { label: "Thursday", value: "4" },
  { label: "Friday", value: "5" },
  { label: "Saturday", value: "6" },
];

export default function EditReport() {
  const { config } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();
  const submit = useSubmit();

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
      backAction={{ content: "Reports", onAction: () => navigate("/app") }}
      title={`Edit: ${config.collectionTitle}`}
      titleMetadata={
        <Badge tone={statusToneMap[config.status]}>
          {config.status.charAt(0).toUpperCase() + config.status.slice(1)}
        </Badge>
      }
    >
      <TitleBar title="Edit Report" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Collection
                </Text>
                <InlineStack gap="300" blockAlign="center">
                  <Button onClick={handleCollectionPicker}>
                    Change Collection
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
                  Schedule
                </Text>
                <FormLayout>
                  <Select
                    label="Frequency"
                    options={SCHEDULE_OPTIONS}
                    value={schedule}
                    onChange={setSchedule}
                  />
                  {schedule === "weekly" && (
                    <Select
                      label="Day of Week"
                      options={DAY_OF_WEEK_OPTIONS}
                      value={scheduleDay}
                      onChange={setScheduleDay}
                    />
                  )}
                  {schedule === "monthly" && (
                    <TextField
                      label="Day of Month"
                      type="number"
                      value={scheduleDay}
                      onChange={setScheduleDay}
                      min={1}
                      max={31}
                      autoComplete="off"
                    />
                  )}
                  <TextField
                    label="Send Time"
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
                  Validity Period
                </Text>
                <FormLayout>
                  <Checkbox
                    label="Set start date"
                    checked={useValidFrom}
                    onChange={setUseValidFrom}
                  />
                  {useValidFrom && (
                    <TextField
                      label="Start Date"
                      type="date"
                      value={validFrom}
                      onChange={setValidFrom}
                      autoComplete="off"
                    />
                  )}
                  <Checkbox
                    label="Set end date"
                    checked={useValidUntil}
                    onChange={setUseValidUntil}
                  />
                  {useValidUntil && (
                    <TextField
                      label="End Date"
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
                  Slack Destination
                </Text>
                <TextField
                  label="Slack Webhook URL"
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
                  Status
                </Text>
                <Checkbox
                  label="Active"
                  checked={isActive}
                  onChange={setIsActive}
                />
              </BlockStack>
            </Card>

            {config.reports.length > 0 && (
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Recent Logs
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
                        {new Date(log.createdAt).toLocaleString("ja-JP")} -
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
                Preview
              </Button>
              <Button onClick={() => navigate("/app")}>Cancel</Button>
              <Button variant="primary" onClick={handleSubmit}>
                Save
              </Button>
            </InlineStack>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
