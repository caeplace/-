import { AssetStatus, ContentStatus, ContentType, Platform } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireCurrentWorkspace } from "@/lib/auth/current-workspace";
import { userMessages } from "@/lib/api-response";
import {
  contentTypeLabels,
  memoryTypeLabels,
  platformLabels,
} from "@/lib/labels";
import { logError } from "@/lib/logger";

export type DbResult<T> = {
  data: T | null;
  error: string | null;
};

const dbErrorMessage =
  "数据库暂不可用。请确认 .env 中的 DATABASE_URL，并执行 prisma migrate 与 seed。";
const missingDbUrlMessage =
  "尚未配置 DATABASE_URL。请复制 .env.example 为 .env，并完成数据库初始化。";
const dbTimeoutMs = 3500;

function getReadableDataError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("登录")) return userMessages.unauthorized;
  if (message.includes("品牌空间") || message.includes("Workspace")) {
    return userMessages.workspaceMissing;
  }
  if (message.includes("DATABASE_URL")) return missingDbUrlMessage;

  return userMessages.databaseUnavailable;
}

async function safeDb<T>(query: () => Promise<T>): Promise<DbResult<T>> {
  if (!process.env.DATABASE_URL) {
    return { data: null, error: missingDbUrlMessage };
  }

  try {
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Database query timed out")), dbTimeoutMs);
    });

    return { data: await Promise.race([query(), timeout]), error: null };
  } catch (error) {
    logError("database", error);
    return {
      data: null,
      error: getReadableDataError(error) || dbErrorMessage,
    };
  }
}

async function getCurrentUserWorkspace() {
  const result = await requireCurrentWorkspace();

  if (!result.data) {
    throw new Error(result.error);
  }

  return result.data;
}

export async function getDashboardData() {
  return safeDb(async () => {
    const current = await getCurrentUserWorkspace();
    if (!current) return null;

    const workspaceId = current.workspace.id;
    const [
      assetCount,
      unusedAssetCount,
      generatedContentCount,
      calendarItemCount,
      batchCount,
      publishedCalendarItemCount,
      pendingPublishCount,
      assetOptions,
      recentContents,
      riskChecks,
    ] = await Promise.all([
      prisma.asset.count({ where: { workspaceId } }),
      prisma.asset.count({ where: { workspaceId, status: AssetStatus.UNUSED } }),
      prisma.generatedContent.count({ where: { workspaceId } }),
      prisma.contentCalendarItem.count({ where: { workspaceId } }),
      prisma.assetBatch.count({ where: { workspaceId } }),
      prisma.contentCalendarItem.count({
        where: { workspaceId, status: ContentStatus.PUBLISHED },
      }),
      prisma.contentCalendarItem.count({
        where: {
          workspaceId,
          status: { in: [ContentStatus.DRAFT, ContentStatus.SCHEDULED] },
        },
      }),
      prisma.asset.findMany({
        where: {
          workspaceId,
          status: { not: AssetStatus.ARCHIVED },
        },
        orderBy: { createdAt: "desc" },
        take: 18,
        select: {
          id: true,
          title: true,
          fileName: true,
          type: true,
          status: true,
          tags: true,
          batch: {
            select: {
              name: true,
            },
          },
        },
      }),
      prisma.generatedContent.findMany({
        where: {
          workspaceId,
          status: { not: ContentStatus.ARCHIVED },
        },
        orderBy: { updatedAt: "desc" },
        take: 3,
        select: {
          id: true,
          title: true,
          platforms: true,
          status: true,
          updatedAt: true,
        },
      }),
      prisma.generatedContent.findMany({
        where: {
          workspaceId,
          status: { not: ContentStatus.ARCHIVED },
        },
        select: {
          riskNotes: true,
        },
      }),
    ]);
    const highRiskContentCount = riskChecks.filter(
      (content) => getRiskLevel(content.riskNotes) === "high",
    ).length;

    return {
      ...current,
      stats: {
        assetCount,
        unusedAssetCount,
        generatedContentCount,
        calendarItemCount,
        batchCount,
        publishedCalendarItemCount,
      },
      onboarding: {
        hasBrandProfile: Boolean(current.workspace.brandProfile),
        hasAssets: assetCount > 0,
        hasGeneratedContent: generatedContentCount > 0,
        hasCalendarItem: calendarItemCount > 0,
        hasPublishedContent: publishedCalendarItemCount > 0,
      },
      dashboard: {
        pendingPublishCount,
        unusedAssetCount,
        highRiskContentCount,
        assetOptions,
        recentContents,
      },
    };
  });
}

export async function getBrandProfileData() {
  return safeDb(async () => {
    const current = await getCurrentUserWorkspace();
    if (!current) return null;

    const memories = await prisma.brandMemory.findMany({
      where: {
        workspaceId: current.workspace.id,
        isActive: true,
      },
      orderBy: [
        { importance: "desc" },
        { priority: "desc" },
        { createdAt: "asc" },
      ],
    });

    return {
      ...current,
      brandProfile: current.workspace.brandProfile,
      memories,
    };
  });
}

export async function getAssetsData(status?: AssetStatus | null) {
  return safeDb(async () => {
    const current = await getCurrentUserWorkspace();
    if (!current) return null;

    const workspaceId = current.workspace.id;
    const assetWhere = status ? { workspaceId, status } : { workspaceId };
    const [assetBatches, assets] = await Promise.all([
      prisma.assetBatch.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
        include: {
          assets: {
            where: status ? { status } : undefined,
            orderBy: { createdAt: "desc" },
            include: {
              generatedContents: {
                orderBy: { createdAt: "desc" },
                select: {
                  id: true,
                  title: true,
                  status: true,
                  platforms: true,
                  createdAt: true,
                  calendarItems: {
                    where: { status: ContentStatus.PUBLISHED },
                    orderBy: { scheduledAt: "desc" },
                    take: 1,
                    select: {
                      id: true,
                      status: true,
                      publishedAt: true,
                      scheduledAt: true,
                    },
                  },
                },
              },
            },
          },
          _count: {
            select: { assets: true },
          },
        },
      }),
      prisma.asset.findMany({
        where: assetWhere,
        orderBy: { createdAt: "desc" },
        include: {
          batch: {
            select: {
              id: true,
              name: true,
            },
          },
          generatedContents: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              title: true,
              status: true,
              platforms: true,
              createdAt: true,
              calendarItems: {
                where: { status: ContentStatus.PUBLISHED },
                orderBy: { scheduledAt: "desc" },
                take: 1,
                select: {
                  id: true,
                  status: true,
                  publishedAt: true,
                  scheduledAt: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      ...current,
      assetBatches,
      assets,
    };
  });
}

export async function getContentStudioData(preselectedAssetIds: string[] = []) {
  return safeDb(async () => {
    const current = await getCurrentUserWorkspace();
    if (!current) return null;

    const workspaceId = current.workspace.id;
    const selectedAssetIds = preselectedAssetIds.filter(Boolean).slice(0, 12);
    const [assets, recentContents, memories] = await Promise.all([
      prisma.asset.findMany({
        where:
          selectedAssetIds.length > 0
            ? {
                workspaceId,
                OR: [
                  { status: { not: AssetStatus.ARCHIVED } },
                  { id: { in: selectedAssetIds } },
                ],
              }
            : {
                workspaceId,
                status: { not: AssetStatus.ARCHIVED },
              },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.generatedContent.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
        take: 12,
        include: {
          assets: true,
        },
      }),
      prisma.brandMemory.findMany({
        where: {
          workspaceId,
          isActive: true,
        },
        orderBy: [
          { importance: "desc" },
          { priority: "desc" },
          { createdAt: "asc" },
        ],
        take: 20,
      }),
    ]);

    return {
      ...current,
      brandProfile: current.workspace.brandProfile,
      memories,
      assets,
      recentContents,
    };
  });
}

export async function getCalendarData() {
  return safeDb(async () => {
    const current = await getCurrentUserWorkspace();
    if (!current) return null;

    const workspaceId = current.workspace.id;

    const [items, generatedContents] = await Promise.all([
      prisma.contentCalendarItem.findMany({
        where: { workspaceId },
        orderBy: { scheduledAt: "asc" },
        include: {
          generatedContent: {
            select: {
              id: true,
              title: true,
              body: true,
              type: true,
              status: true,
              platforms: true,
              assets: {
                select: {
                  id: true,
                  title: true,
                  fileName: true,
                },
              },
            },
          },
        },
      }),
      prisma.generatedContent.findMany({
        where: {
          workspaceId,
          status: { not: ContentStatus.ARCHIVED },
        },
        orderBy: { createdAt: "desc" },
        take: 30,
        include: {
          assets: {
            select: {
              id: true,
              title: true,
              fileName: true,
            },
          },
        },
      }),
    ]);

    return {
      ...current,
      items,
      generatedContents,
    };
  });
}

function getRiskLevel(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const record = value as { riskLevel?: unknown };
  return typeof record.riskLevel === "string" ? record.riskLevel : null;
}

function getTopEntry<T extends string>(counts: Map<T, number>) {
  const entry = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return entry ? { value: entry[0], count: entry[1] } : null;
}

export async function getInsightsData() {
  return safeDb(async () => {
    const current = await getCurrentUserWorkspace();
    if (!current) return null;

    const workspaceId = current.workspace.id;
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);
    const monthLabel = new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "long",
    }).format(monthStart);

    const [
      assetCount,
      unusedAssetCount,
      usedAssetCount,
      contentCount,
      calendarItemCount,
      activeMemoryCount,
      assetsByStatus,
      contentsByStatus,
      monthlyGeneratedContents,
      monthlyCalendarItems,
      memories,
      unusedAssetSamples,
      unplannedContentSamples,
    ] = await Promise.all([
      prisma.asset.count({ where: { workspaceId } }),
      prisma.asset.count({ where: { workspaceId, status: AssetStatus.UNUSED } }),
      prisma.asset.count({ where: { workspaceId, status: AssetStatus.USED } }),
      prisma.generatedContent.count({ where: { workspaceId } }),
      prisma.contentCalendarItem.count({ where: { workspaceId } }),
      prisma.brandMemory.count({
        where: {
          workspaceId,
          isActive: true,
        },
      }),
      prisma.asset.groupBy({
        by: ["status"],
        where: { workspaceId },
        _count: { _all: true },
      }),
      prisma.generatedContent.groupBy({
        by: ["status"],
        where: { workspaceId },
        _count: { _all: true },
      }),
      prisma.generatedContent.findMany({
        where: {
          workspaceId,
          createdAt: { gte: monthStart, lt: monthEnd },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          type: true,
          status: true,
          platforms: true,
          riskNotes: true,
          createdAt: true,
        },
      }),
      prisma.contentCalendarItem.findMany({
        where: {
          workspaceId,
          scheduledAt: { gte: monthStart, lt: monthEnd },
        },
        orderBy: { scheduledAt: "asc" },
        select: {
          id: true,
          title: true,
          platform: true,
          contentType: true,
          status: true,
          scheduledAt: true,
          publishedAt: true,
        },
      }),
      prisma.brandMemory.findMany({
        where: {
          workspaceId,
          isActive: true,
        },
        orderBy: [
          { importance: "desc" },
          { priority: "desc" },
          { createdAt: "asc" },
        ],
        take: 12,
      }),
      prisma.asset.findMany({
        where: { workspaceId, status: AssetStatus.UNUSED },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          title: true,
          fileName: true,
          type: true,
          tags: true,
        },
      }),
      prisma.generatedContent.findMany({
        where: {
          workspaceId,
          status: { not: ContentStatus.ARCHIVED },
          calendarItems: { none: {} },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          title: true,
          type: true,
          status: true,
          platforms: true,
          createdAt: true,
        },
      }),
    ]);

    const platformCounts = new Map<Platform, number>();
    for (const content of monthlyGeneratedContents) {
      for (const platform of content.platforms) {
        platformCounts.set(platform, (platformCounts.get(platform) ?? 0) + 1);
      }
    }
    for (const item of monthlyCalendarItems) {
      platformCounts.set(item.platform, (platformCounts.get(item.platform) ?? 0) + 1);
    }

    const contentTypeCounts = new Map<ContentType, number>();
    for (const content of monthlyGeneratedContents) {
      contentTypeCounts.set(content.type, (contentTypeCounts.get(content.type) ?? 0) + 1);
    }
    for (const item of monthlyCalendarItems) {
      contentTypeCounts.set(
        item.contentType,
        (contentTypeCounts.get(item.contentType) ?? 0) + 1,
      );
    }

    const topPlatform = getTopEntry(platformCounts);
    const topContentType = getTopEntry(contentTypeCounts);
    const highRiskContents = monthlyGeneratedContents.filter(
      (content) => getRiskLevel(content.riskNotes) === "high",
    );
    const plannedPublishCount = monthlyCalendarItems.length;
    const publishedCount = monthlyCalendarItems.filter(
      (item) => item.status === ContentStatus.PUBLISHED,
    ).length;
    const unplannedContentCount = await prisma.generatedContent.count({
      where: {
        workspaceId,
        status: { not: ContentStatus.ARCHIVED },
        calendarItems: { none: {} },
      },
    });

    const insightsInput = {
      workspaceName: current.workspace.name,
      monthLabel,
      brandProfile: current.workspace.brandProfile
        ? {
            brandName: current.workspace.brandProfile.brandName,
            industry: current.workspace.brandProfile.industry,
            productDescription:
              current.workspace.brandProfile.productDescription ??
              current.workspace.brandProfile.description,
            targetAudience: current.workspace.brandProfile.targetAudience,
            brandTone: current.workspace.brandProfile.brandTone,
            forbiddenWords: current.workspace.brandProfile.forbiddenWords,
            recommendedPlatforms:
              current.workspace.brandProfile.recommendedPlatforms,
          }
        : null,
      metrics: {
        generatedContentCount: monthlyGeneratedContents.length,
        plannedPublishCount,
        publishedCount,
        unplannedContentCount,
        topPlatform: topPlatform ? platformLabels[topPlatform.value] : null,
        topPlatformCount: topPlatform?.count ?? 0,
        unusedAssetCount,
        usedAssetCount,
        highRiskContentCount: highRiskContents.length,
        mostCommonContentType: topContentType
          ? contentTypeLabels[topContentType.value]
          : null,
        mostCommonContentTypeCount: topContentType?.count ?? 0,
        activeMemoryCount,
      },
      brandMemories: memories.map((memory) => ({
        type: memoryTypeLabels[memory.type],
        title: memory.title,
        content: memory.content,
        source: memory.source,
        importance: memory.importance ?? memory.priority,
      })),
      contentSamples: monthlyGeneratedContents.slice(0, 8).map((content) => ({
        title: content.title,
        type: contentTypeLabels[content.type],
        status: content.status,
        platforms: content.platforms.map((platform) => platformLabels[platform]),
        riskLevel: getRiskLevel(content.riskNotes),
      })),
      calendarSamples: monthlyCalendarItems.slice(0, 8).map((item) => ({
        title: item.title,
        platform: platformLabels[item.platform],
        contentType: contentTypeLabels[item.contentType],
        status: item.status,
        scheduledAt: item.scheduledAt.toISOString(),
      })),
    };

    return {
      ...current,
      monthLabel,
      stats: {
        assetCount,
        unusedAssetCount,
        usedAssetCount,
        contentCount,
        calendarItemCount,
        activeMemoryCount,
        monthlyGeneratedContentCount: monthlyGeneratedContents.length,
        monthlyPlannedPublishCount: plannedPublishCount,
        monthlyPublishedCount: publishedCount,
        unplannedContentCount,
        highRiskContentCount: highRiskContents.length,
      },
      assetsByStatus,
      contentsByStatus,
      topPlatform: topPlatform
        ? { platform: topPlatform.value, count: topPlatform.count }
        : null,
      topContentType: topContentType
        ? { contentType: topContentType.value, count: topContentType.count }
        : null,
      highRiskContents: highRiskContents.map((content) => ({
        id: content.id,
        title: content.title,
        type: content.type,
        platforms: content.platforms,
        riskLevel: getRiskLevel(content.riskNotes),
      })),
      unusedAssetSamples,
      unplannedContentSamples,
      insightsInput,
    };
  });
}
