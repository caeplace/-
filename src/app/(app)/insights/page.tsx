import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  FileText,
  Lightbulb,
  PackageOpen,
  Sparkles,
  Upload,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import {
  createInsightsFallback,
  generateInsights,
  isAiConfigured,
} from "@/services/ai";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  contentStatusLabels,
  contentTypeLabels,
  platformLabels,
} from "@/lib/labels";
import { logError } from "@/lib/logger";
import { getInsightsData } from "@/services/db/current-workspace";

export const dynamic = "force-dynamic";

function SummaryPill({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "warning";
}) {
  return (
    <div
      className={`rounded-md border px-3 py-2 ${
        tone === "warning" ? "border-destructive/25 bg-destructive/5" : ""
      }`}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function AdviceList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">
        暂无可执行建议。继续上传素材、生成内容并加入日历后，这里会变得更有用。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={`${item}-${index}`} className="flex gap-3 rounded-md border p-4">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {index + 1}
          </span>
          <p className="text-sm leading-6 text-muted-foreground">{item}</p>
        </div>
      ))}
    </div>
  );
}

function ReminderBlock({
  title,
  description,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  action?: {
    href: string;
    label: string;
  };
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-4 text-primary" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {children}
        {action ? (
          <Button asChild size="sm" variant="outline">
            <Link href={action.href}>
              {action.label}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function EmptyReminder({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
      <CheckCircle2 className="size-4 text-primary" />
      {children}
    </div>
  );
}

function getActionableAdvice(insights: ReturnType<typeof createInsightsFallback>) {
  return [
    ...insights.assetSuggestions,
    ...insights.contentSuggestions,
    ...insights.platformSuggestions,
    ...insights.riskSuggestions,
    ...insights.nextMonthPlan,
  ]
    .filter(Boolean)
    .slice(0, 7);
}

export default async function InsightsPage() {
  const result = await getInsightsData();
  const data = result.data;

  if (!data) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Insights"
          title="运营建议"
          description="基于当前系统内数据生成简单、可执行的运营建议。"
        />
        <EmptyState
          title="暂无可用数据"
          description={
            result.error ??
            "请先上传素材，再生成内容，并把内容加入日历后再查看运营建议。"
          }
          action={
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild>
                <Link href="/assets">
                  <Upload className="size-4" />
                  上传素材
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/content-studio">
                  <Sparkles className="size-4" />
                  生成内容
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/calendar">
                  <CalendarDays className="size-4" />
                  加入日历
                </Link>
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  const hasOperationalData =
    data.stats.assetCount > 0 ||
    data.stats.contentCount > 0 ||
    data.stats.calendarItemCount > 0;

  if (!hasOperationalData) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Insights"
          title={`${data.workspace.name} 运营建议`}
          description="这里不会展示虚构数据；先沉淀素材、内容和日历计划后再生成建议。"
        />
        <EmptyState
          title="还没有可建议的运营数据"
          description="建议按顺序完成：先上传素材，再生成内容，最后把内容加入日历。"
          action={
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild>
                <Link href="/assets">
                  <Upload className="size-4" />
                  上传素材
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/content-studio">
                  <Sparkles className="size-4" />
                  生成内容
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/calendar">
                  <CalendarDays className="size-4" />
                  加入日历
                </Link>
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  const aiResult = isAiConfigured()
    ? await generateInsights(data.insightsInput).catch((error) => {
        logError("insights/ai", error);
        return null;
      })
    : null;
  const insights = aiResult?.data ?? createInsightsFallback(data.insightsInput);
  const actionableAdvice = getActionableAdvice(insights);
  const hasReminders =
    data.stats.unusedAssetCount > 0 ||
    data.stats.unplannedContentCount > 0 ||
    data.stats.highRiskContentCount > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Insights"
        title={`${data.workspace.name} 运营建议`}
        description={`${data.monthLabel}，只基于品牌档案、素材、生成内容、内容日历和品牌记忆。`}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="size-4 text-primary" />
            本月简要总结
          </CardTitle>
          <CardDescription>
            不包含曝光、点击、转化、粉丝增长等外部平台数据。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-7 text-muted-foreground">
            {insights.monthlySummary}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <SummaryPill
              label="生成内容"
              value={data.stats.monthlyGeneratedContentCount}
            />
            <SummaryPill
              label="已加入日历"
              value={data.stats.monthlyPlannedPublishCount}
            />
            <SummaryPill
              label="已发布"
              value={data.stats.monthlyPublishedCount}
            />
            <SummaryPill
              label="未使用素材"
              value={data.stats.unusedAssetCount}
              tone={data.stats.unusedAssetCount > 0 ? "warning" : "default"}
            />
            <SummaryPill
              label="高风险内容"
              value={data.stats.highRiskContentCount}
              tone={data.stats.highRiskContentCount > 0 ? "warning" : "default"}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">来源：品牌档案</Badge>
            <Badge variant="outline">素材 {data.stats.assetCount}</Badge>
            <Badge variant="outline">内容 {data.stats.contentCount}</Badge>
            <Badge variant="outline">日历 {data.stats.calendarItemCount}</Badge>
            <Badge variant="outline">品牌记忆 {data.stats.activeMemoryCount}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="size-4 text-primary" />
            AI 运营建议
          </CardTitle>
          <CardDescription>
            建议来自当前系统数据，优先给出下一步可以直接执行的动作。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdviceList items={actionableAdvice} />
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">待处理提醒</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            只显示系统里真实存在、需要运营人员处理的项目。
          </p>
        </div>

        {!hasReminders ? (
          <Card>
            <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 text-primary" />
              当前没有明显待处理项。可以继续上传新素材或生成下一批内容。
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-3">
          <ReminderBlock
            title="未使用素材"
            description={`当前还有 ${data.stats.unusedAssetCount} 个素材未被内容使用。`}
            icon={PackageOpen}
            action={
              data.stats.unusedAssetCount > 0
                ? { href: "/assets", label: "查看素材" }
                : undefined
            }
          >
            {data.unusedAssetSamples.length > 0 ? (
              <div className="space-y-2">
                {data.unusedAssetSamples.slice(0, 3).map((asset) => (
                  <div key={asset.id} className="rounded-md border p-3">
                    <p className="truncate text-sm font-medium">
                      {asset.fileName ?? asset.title}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {asset.tags.slice(0, 3).join("，") || "暂无标签"}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyReminder>暂无未使用素材。</EmptyReminder>
            )}
          </ReminderBlock>

          <ReminderBlock
            title="未加入日历的内容"
            description={`当前还有 ${data.stats.unplannedContentCount} 条内容没有发布计划。`}
            icon={CalendarDays}
            action={
              data.stats.unplannedContentCount > 0
                ? { href: "/calendar", label: "去排期" }
                : undefined
            }
          >
            {data.unplannedContentSamples.length > 0 ? (
              <div className="space-y-2">
                {data.unplannedContentSamples.slice(0, 3).map((content) => (
                  <div key={content.id} className="rounded-md border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {content.title}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {contentTypeLabels[content.type]} ·{" "}
                          {content.platforms
                            .map((platform) => platformLabels[platform])
                            .join("，") || "未设置平台"}
                        </p>
                      </div>
                      <Badge variant="outline">
                        {contentStatusLabels[content.status]}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyReminder>已保存内容基本都有日历计划。</EmptyReminder>
            )}
          </ReminderBlock>

          <ReminderBlock
            title="高风险内容"
            description={`本月有 ${data.stats.highRiskContentCount} 条内容需要复核。`}
            icon={AlertTriangle}
          >
            {data.highRiskContents.length > 0 ? (
              <div className="space-y-2">
                {data.highRiskContents.slice(0, 3).map((content) => (
                  <div key={content.id} className="rounded-md border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {content.title}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {contentTypeLabels[content.type]} ·{" "}
                          {content.platforms
                            .map((platform) => platformLabels[platform])
                            .join("，") || "未设置平台"}
                        </p>
                      </div>
                      <Badge variant="accent">高风险</Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyReminder>本月暂无 high 风险内容。</EmptyReminder>
            )}
          </ReminderBlock>
        </div>
      </section>
    </div>
  );
}
