import { AssetStatus, AssetType } from "@prisma/client";
import {
  AssetLibrary,
  type AssetLibraryAsset,
  type AssetLibraryBatch,
} from "@/components/assets/asset-library";
import { AssetUploadDialog } from "@/components/assets/asset-upload-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { getAssetsData } from "@/services/db/current-workspace";

export const dynamic = "force-dynamic";

type AssetsPageProps = {
  searchParams?: Promise<{
    batchId?: string;
    q?: string;
    status?: string;
    type?: string;
  }>;
};

function parseAssetStatus(value?: string) {
  if (
    value === AssetStatus.UNUSED ||
    value === AssetStatus.USED ||
    value === AssetStatus.ARCHIVED
  ) {
    return value;
  }

  return "ALL";
}

function parseAssetType(value?: string) {
  if (
    value === AssetType.IMAGE ||
    value === AssetType.VIDEO ||
    value === AssetType.DOCUMENT ||
    value === AssetType.LINK ||
    value === AssetType.TEXT
  ) {
    return value;
  }

  return "ALL";
}

export default async function AssetsPage({ searchParams }: AssetsPageProps) {
  const params = await searchParams;
  const result = await getAssetsData();
  const data = result.data;

  if (!data) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Assets"
          title="素材库"
          description="上传第一批产品素材，AI 会帮你整理和打标签。"
        />
        <EmptyState
          title="暂无素材数据"
          description={
            result.error ?? "请先执行 seed，或为当前 workspace 创建素材。"
          }
          action={<AssetUploadDialog />}
        />
      </div>
    );
  }

  const batches: AssetLibraryBatch[] = data.assetBatches.map((batch) => ({
    id: batch.id,
    name: batch.name,
    description: batch.description,
    source: batch.source,
    assetCount: batch._count.assets,
    updatedAt: batch.updatedAt.toISOString(),
  }));

  const assets: AssetLibraryAsset[] = data.assets.map((asset) => ({
    id: asset.id,
    title: asset.title,
    description: asset.description,
    url: asset.url,
    fileName: asset.fileName,
    fileType: asset.fileType,
    fileUrl: asset.fileUrl,
    thumbnailUrl: asset.thumbnailUrl,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    type: asset.type,
    status: asset.status,
    usageStatus: asset.usageStatus,
    tags: asset.tags,
    aiDescription: asset.aiDescription,
    productName: asset.productName,
    scene: asset.scene,
    visualStyle: asset.visualStyle,
    suggestedUse: asset.suggestedUse,
    recommendedPlatforms: asset.recommendedPlatforms,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
    batch: {
      id: asset.batch.id,
      name: asset.batch.name,
    },
    generatedContents: asset.generatedContents.map((content) => ({
      id: content.id,
      title: content.title,
      status: content.status,
      platforms: content.platforms,
      createdAt: content.createdAt.toISOString(),
      calendarItems: content.calendarItems.map((item) => ({
        id: item.id,
        status: item.status,
        publishedAt: item.publishedAt?.toISOString() ?? null,
        scheduledAt: item.scheduledAt.toISOString(),
      })),
    })),
  }));

  return (
    <div>
      {assets.length === 0 ? (
        <EmptyState
          title="上传第一批产品素材，AI 会帮你整理和打标签。"
          description="可以先上传产品图、场景图、PDF、视频或文本资料，后续内容生成会优先参考这些素材。"
          action={<AssetUploadDialog />}
        />
      ) : (
        <AssetLibrary
          workspaceName={data.workspace.name}
          assets={assets}
          batches={batches}
          initialStatus={parseAssetStatus(params?.status)}
          initialType={parseAssetType(params?.type)}
          initialBatchId={params?.batchId ?? "ALL"}
          initialQuery={params?.q ?? ""}
        />
      )}
    </div>
  );
}
