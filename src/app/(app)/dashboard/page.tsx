import Link from "next/link";
import { Plus } from "lucide-react";
import { DashboardHome } from "@/components/dashboard/dashboard-home";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { getDashboardData } from "@/services/db/current-workspace";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const result = await getDashboardData();
  const data = result.data;

  if (!data) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Dashboard"
          title="品牌空间概览"
          description="连接数据库后，这里会显示当前 workspace 的素材、内容和日历统计。"
        />
        <EmptyState
          title="暂无可用 workspace"
          description={
            result.error ??
            "请先执行数据库迁移和 seed，或创建一个新的品牌空间。"
          }
          action={
            <Button asChild>
              <Link href="/workspaces/new">
                <Plus className="size-4" />
                创建品牌空间
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <DashboardHome
      workspaceName={data.workspace.name}
      brandName={data.workspace.brandProfile?.brandName ?? null}
      todo={{
        pendingPublishCount: data.dashboard.pendingPublishCount,
        unusedAssetCount: data.dashboard.unusedAssetCount,
        highRiskContentCount: data.dashboard.highRiskContentCount,
      }}
      assets={data.dashboard.assetOptions.map((asset) => ({
        id: asset.id,
        title: asset.title,
        fileName: asset.fileName,
        type: asset.type,
        status: asset.status,
        tags: asset.tags,
        batch: asset.batch,
      }))}
      recentContents={data.dashboard.recentContents.map((content) => ({
        id: content.id,
        title: content.title,
        platforms: content.platforms,
        status: content.status,
        updatedAt: content.updatedAt.toISOString(),
      }))}
    />
  );
}
