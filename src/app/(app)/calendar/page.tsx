import {
  CalendarContent,
  type CalendarGeneratedContentOption,
  type CalendarPlanItem,
} from "@/components/calendar/calendar-content";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { getCalendarData } from "@/services/db/current-workspace";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const result = await getCalendarData();
  const data = result.data;

  if (!data) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Calendar"
          title="内容日历"
          description="连接数据库后，这里会读取当前 workspace 的 ContentCalendarItem。"
        />
        <EmptyState
          title="暂无内容日历"
          description={
            result.error ??
            "请先执行 seed，或为当前 workspace 创建内容日历项。"
          }
        />
      </div>
    );
  }

  const items: CalendarPlanItem[] = data.items.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    platform: item.platform,
    contentType: item.contentType,
    status: item.status,
    scheduledAt: item.scheduledAt.toISOString(),
    publishedAt: item.publishedAt?.toISOString() ?? null,
    ownerName: item.ownerName,
    notes: item.notes,
    generatedContentId: item.generatedContentId,
    generatedContentTitle: item.generatedContent?.title ?? null,
    generatedContentBody: item.generatedContent?.body ?? null,
    generatedContentAssets:
      item.generatedContent?.assets.map((asset) => ({
        id: asset.id,
        title: asset.title,
        fileName: asset.fileName,
      })) ?? [],
  }));

  const generatedContents: CalendarGeneratedContentOption[] =
    data.generatedContents.map((content) => ({
      id: content.id,
      title: content.title,
      body: content.body,
      type: content.type,
      status: content.status,
      platforms: content.platforms,
      assets: content.assets,
    }));

  return (
    <CalendarContent
      workspaceName={data.workspace.name}
      items={items}
      generatedContents={generatedContents}
    />
  );
}
