import { ContentGenerator } from "@/components/content-studio/content-generator";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import type {
  ComplianceCheckResult,
  RiskLevel,
} from "@/lib/prompts/compliance-check";
import { getContentStudioData } from "@/services/db/current-workspace";

export const dynamic = "force-dynamic";

type ContentStudioPageProps = {
  searchParams?: Promise<{
    assetIds?: string;
    brief?: string;
  }>;
};

function isRiskLevel(value: unknown): value is RiskLevel {
  return value === "low" || value === "medium" || value === "high";
}

function normalizeRiskNotes(value: unknown): ComplianceCheckResult | null {
  if (!value || typeof value !== "object") return null;

  const record = value as {
    riskLevel?: unknown;
    issues?: unknown;
    overallSuggestion?: unknown;
  };

  if (!isRiskLevel(record.riskLevel)) return null;

  return {
    riskLevel: record.riskLevel,
    issues: Array.isArray(record.issues)
      ? record.issues
          .map((issue) => {
            if (!issue || typeof issue !== "object") return null;
            const issueRecord = issue as {
              text?: unknown;
              reason?: unknown;
              suggestion?: unknown;
            };

            return {
              text:
                typeof issueRecord.text === "string"
                  ? issueRecord.text
                  : "未标注",
              reason:
                typeof issueRecord.reason === "string"
                  ? issueRecord.reason
                  : "未标注原因",
              suggestion:
                typeof issueRecord.suggestion === "string"
                  ? issueRecord.suggestion
                  : "建议人工复核。",
            };
          })
          .filter((issue): issue is ComplianceCheckResult["issues"][number] =>
            Boolean(issue),
          )
      : [],
    overallSuggestion:
      typeof record.overallSuggestion === "string"
        ? record.overallSuggestion
        : "建议发布前人工复核。",
  };
}

function parseAssetIds(value?: string) {
  if (!value) return [];

  return value
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function parseInitialBrief(value?: string) {
  return value?.trim().slice(0, 800) ?? "";
}

export default async function ContentStudioPage({
  searchParams,
}: ContentStudioPageProps) {
  const params = await searchParams;
  const initialSelectedAssetIds = parseAssetIds(params?.assetIds);
  const initialCreativeBrief = parseInitialBrief(params?.brief);
  const result = await getContentStudioData(initialSelectedAssetIds);
  const data = result.data;

  if (!data) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Content Studio"
          title="AI 内容生成"
          description="读取 BrandProfile、BrandMemory 和素材，生成可保存的社媒内容。"
        />
        <EmptyState
          title="暂无内容生成上下文"
          description={
            result.error ??
            "请先执行 seed，或为当前 workspace 创建品牌档案与素材。"
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Content Studio"
        title="AI 内容生成"
        description="基于品牌档案、长期记忆和已分析素材，生成多平台营销内容草稿。"
      />

      <ContentGenerator
        workspaceName={data.workspace.name}
        brandName={data.brandProfile?.brandName ?? null}
        brandTone={data.brandProfile?.brandTone ?? null}
        assets={data.assets.map((asset) => ({
          id: asset.id,
          title: asset.title,
          fileName: asset.fileName,
          type: asset.type,
          tags: asset.tags,
          aiDescription: asset.aiDescription,
          productName: asset.productName,
          scene: asset.scene,
        }))}
        recentContents={data.recentContents.map((content) => ({
          id: content.id,
          title: content.title,
          body: content.body,
          status: content.status,
          platforms: content.platforms,
          type: content.type,
          hashtags: content.hashtags,
          callToAction: content.callToAction,
          createdAt: content.createdAt.toISOString(),
          riskNotes: normalizeRiskNotes(content.riskNotes),
          assets: content.assets.map((asset) => ({
            id: asset.id,
            title: asset.title,
            fileName: asset.fileName,
          })),
        }))}
        initialSelectedAssetIds={initialSelectedAssetIds}
        initialCreativeBrief={initialCreativeBrief}
      />
    </div>
  );
}
