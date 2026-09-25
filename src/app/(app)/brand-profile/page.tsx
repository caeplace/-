import {
  type BrandMemoryItem,
} from "@/components/brand-profile/brand-memory-manager";
import { BrandProfileQuestionnaire } from "@/components/brand-profile/brand-profile-questionnaire";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import {
  listToCommaText,
  platformPreferencesToText,
  type BrandProfileFormValues,
} from "@/lib/validators/brand-profile";
import { getBrandProfileData } from "@/services/db/current-workspace";

export const dynamic = "force-dynamic";

export default async function BrandProfilePage() {
  const result = await getBrandProfileData();
  const data = result.data;

  if (!data) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Brand Profile"
          title="品牌档案问卷"
          description="填写品牌基础信息、用户画像、语调、禁用词和平台偏好。"
        />
        <EmptyState
          title="暂无可用 workspace"
          description={
            result.error ?? "请先执行 seed，或创建一个 workspace。"
          }
        />
      </div>
    );
  }

  const profile = data.brandProfile;
  const memories: BrandMemoryItem[] = data.memories.map((memory) => ({
    id: memory.id,
    type: memory.type,
    title: memory.title,
    content: memory.content,
    source: memory.source,
    importance: memory.importance,
    priority: memory.priority,
    createdAt: memory.createdAt.toISOString(),
    updatedAt: memory.updatedAt.toISOString(),
  }));
  const initialValues: BrandProfileFormValues = {
    brandName: profile?.brandName ?? data.workspace.name,
    websiteUrl: profile?.websiteUrl ?? "",
    storeUrl: profile?.storeUrl ?? "",
    industry: profile?.industry ?? "",
    productDescription:
      profile?.productDescription ?? profile?.description ?? "",
    targetAudience:
      profile?.targetAudience ?? profile?.targetAudiences?.join("，") ?? "",
    brandTone: profile?.brandTone ?? profile?.toneKeywords?.join("，") ?? "",
    brandKeywords: listToCommaText(profile?.brandKeywords),
    forbiddenWords: listToCommaText(profile?.forbiddenWords),
    competitorLinks: listToCommaText(profile?.competitorLinks),
    platformPreferences: platformPreferencesToText(profile?.platformPreferences),
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Brand Profile"
        title="品牌档案"
        description="让 AI 了解你的品牌基础信息、语调规则、内容方向和长期记忆。"
      />

      <BrandProfileQuestionnaire
        workspaceName={data.workspace.name}
        initialValues={initialValues}
        hasSavedProfile={Boolean(profile)}
        initialMemories={memories}
        initialAnalysis={
          profile
            ? {
                brandSummary: profile.brandSummary,
                targetAudienceSummary: profile.targetAudienceSummary,
                toneOfVoice: profile.toneOfVoice,
                contentAngles: profile.contentAngles,
                forbiddenClaims: profile.forbiddenClaims,
                recommendedPlatforms: profile.recommendedPlatforms,
                marketingSuggestions: profile.marketingSuggestions,
                aiAnalysisUpdatedAt:
                  profile.aiAnalysisUpdatedAt?.toISOString() ?? null,
              }
            : null
        }
      />
    </div>
  );
}
