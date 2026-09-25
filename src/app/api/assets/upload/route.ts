import { AssetStatus, AssetType } from "@prisma/client";
import {
  apiError,
  apiSuccess,
  getWorkspaceErrorMessage,
  userMessages,
} from "@/lib/api-response";
import { requireCurrentWorkspace } from "@/lib/auth/current-workspace";
import { logError, logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { uploadAssetFile } from "@/lib/storage";
import { splitCommaText } from "@/lib/validators/brand-profile";

export const runtime = "nodejs";

const supportedDocumentMimeTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

const supportedTextExtensions = new Set([".txt", ".md", ".csv", ".tsv"]);

async function getTemporaryWorkspace() {
  const result = await requireCurrentWorkspace();
  return {
    workspace: result.data?.workspace ?? null,
    error: result.error,
  };
}

function getStringValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function getFileExtension(fileName: string) {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex < 0) return "";
  return fileName.slice(dotIndex).toLowerCase();
}

function inferAssetType(file: File): AssetType | null {
  if (file.type.startsWith("image/")) return AssetType.IMAGE;
  if (file.type.startsWith("video/")) return AssetType.VIDEO;
  if (supportedDocumentMimeTypes.has(file.type)) return AssetType.DOCUMENT;
  if (file.type.startsWith("text/")) return AssetType.TEXT;
  if (supportedTextExtensions.has(getFileExtension(file.name))) return AssetType.TEXT;
  return null;
}

function getAssetTypeLabel(type: AssetType) {
  if (type === AssetType.IMAGE) return "图片";
  if (type === AssetType.VIDEO) return "视频";
  if (type === AssetType.TEXT) return "文本资料";
  return "文档";
}

function createMockAiDescription({
  fileName,
  type,
  scene,
  suggestedUse,
}: {
  fileName: string;
  type: AssetType;
  scene: string;
  suggestedUse: string;
}) {
  const pieces = [
    `已上传${getAssetTypeLabel(type)}素材「${fileName}」。`,
    scene ? `场景：${scene}。` : "待补充具体使用场景。",
    suggestedUse
      ? `建议用途：${suggestedUse}。`
      : "后续可接入 AI 自动识别卖点、场景和适配平台。",
  ];

  return pieces.join("");
}

export async function POST(request: Request) {
  let createdBatchId: string | null = null;

  try {
    if (!process.env.DATABASE_URL) {
      return apiError(userMessages.databaseNotConfigured, {
        status: 500,
        scope: "assets/upload",
        error: new Error("DATABASE_URL is not configured"),
      });
    }

    const { workspace, error } = await getTemporaryWorkspace();

    if (!workspace) {
      return apiError(getWorkspaceErrorMessage(error), { status: 404 });
    }

    const formData = await request.formData().catch(() => null);

    if (!formData) {
      return apiError("上传表单格式无效，请重新选择文件后再试。", {
        status: 400,
      });
    }

    const name = getStringValue(formData.get("name"));
    const description = getStringValue(formData.get("description"));
    const productName = getStringValue(formData.get("productName"));
    const scene = getStringValue(formData.get("scene"));
    const suggestedUse = getStringValue(formData.get("suggestedUse"));
    const tags = splitCommaText(getStringValue(formData.get("tags")));
    const recommendedPlatforms = splitCommaText(
      getStringValue(formData.get("recommendedPlatforms")),
    );
    const files = formData
      .getAll("files")
      .filter((value): value is File => value instanceof File && value.size > 0);

    if (!name) {
      return apiError("请填写素材批次名称。", { status: 400 });
    }

    if (files.length === 0) {
      return apiError("请至少选择一个素材文件。", { status: 400 });
    }

    const unsupportedFiles = files.filter((file) => !inferAssetType(file));

    if (unsupportedFiles.length > 0) {
      return apiError(
        `有 ${unsupportedFiles.length} 个文件类型暂不支持，请移除后重试。`,
        {
          status: 400,
          scope: "assets/upload",
          error: new Error("Unsupported file type"),
          context: {
            files: unsupportedFiles.map((file) => ({
              name: file.name,
              type: file.type,
            })),
          },
        },
      );
    }

    const batch = await prisma.assetBatch.create({
      data: {
        workspaceId: workspace.id,
        name,
        description: description || null,
        source: "local_mock_storage",
      },
    });
    createdBatchId = batch.id;

    const uploadedFiles = await Promise.all(
      files.map(async (file) => {
        const type = inferAssetType(file);

        if (!type) {
          throw new Error(`Unsupported file type: ${file.name}`);
        }

        const storedFile = await uploadAssetFile({
          file,
          workspaceId: workspace.id,
          batchId: batch.id,
        });

        return {
          file,
          type,
          storedFile,
        };
      }),
    );

    const assets = await prisma.$transaction(
      uploadedFiles.map(({ file, type, storedFile }) => {
        const aiDescription = createMockAiDescription({
          fileName: storedFile.fileName,
          type,
          scene,
          suggestedUse,
        });

        return prisma.asset.create({
          data: {
            workspaceId: workspace.id,
            batchId: batch.id,
            type,
            status: AssetStatus.UNUSED,
            title: storedFile.fileName,
            description: aiDescription,
            url: storedFile.fileUrl,
            fileName: storedFile.fileName,
            fileType: storedFile.fileType,
            fileUrl: storedFile.fileUrl,
            thumbnailUrl: storedFile.thumbnailUrl,
            usageStatus: AssetStatus.UNUSED,
            aiDescription,
            productName: productName || null,
            scene: scene || null,
            suggestedUse: suggestedUse || null,
            recommendedPlatforms,
            mimeType: storedFile.fileType,
            sizeBytes: storedFile.sizeBytes,
            tags: tags.length > 0 ? tags : [getAssetTypeLabel(type)],
            metadata: {
              storageProvider: storedFile.provider,
              originalName: file.name,
            },
          },
        });
      }),
    );

    return apiSuccess(
      {
        message: "素材批次已创建。",
        batch: {
          id: batch.id,
          name: batch.name,
        },
        assetCount: assets.length,
        assets: assets.map((asset) => ({
          id: asset.id,
          title: asset.title,
          fileName: asset.fileName,
          type: asset.type,
          tags: asset.tags,
          aiDescription: asset.aiDescription,
          productName: asset.productName,
          scene: asset.scene,
        })),
      },
      "assets/upload",
      { workspaceId: workspace.id, batchId: batch.id, assetCount: assets.length },
    );
  } catch (error) {
    if (createdBatchId) {
      await prisma.assetBatch
        .delete({ where: { id: createdBatchId } })
        .catch((cleanupError) => {
          logWarn("assets/upload", "failed to cleanup asset batch", {
            batchId: createdBatchId,
            cleanupError,
          });
        });
    }

    logError("assets/upload", error);
    return apiError(userMessages.uploadFailed, { status: 500 });
  }
}
