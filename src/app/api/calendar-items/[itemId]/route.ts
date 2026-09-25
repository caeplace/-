import {
  apiError,
  apiSuccess,
  getWorkspaceErrorMessage,
  userMessages,
} from "@/lib/api-response";
import { requireCurrentWorkspace } from "@/lib/auth/current-workspace";
import { prisma } from "@/lib/prisma";
import { updateCalendarItemSchema } from "@/lib/validators/calendar";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    itemId: string;
  }>;
};

async function getTemporaryWorkspace() {
  const result = await requireCurrentWorkspace();
  return {
    workspace: result.data?.workspace ?? null,
    error: result.error,
  };
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    if (!process.env.DATABASE_URL) {
      return apiError(userMessages.databaseNotConfigured, {
        status: 500,
        scope: "calendar/update",
        error: new Error("DATABASE_URL is not configured"),
      });
    }

    const { itemId } = await context.params;
    const json = await request.json().catch(() => null);
    const parsed = updateCalendarItemSchema.safeParse(json);

    if (!parsed.success) {
      return apiError("日历计划信息有误，请检查日期、时间和主题。", {
        status: 400,
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    const values = parsed.data;
    const scheduledAt = new Date(`${values.plannedDate}T${values.plannedTime}:00`);

    if (Number.isNaN(scheduledAt.getTime())) {
      return apiError("发布日期或发布时间无效。", { status: 400 });
    }

    const { workspace, error } = await getTemporaryWorkspace();

    if (!workspace) {
      return apiError(getWorkspaceErrorMessage(error), { status: 404 });
    }

    const existing = await prisma.contentCalendarItem.findFirst({
      where: {
        id: itemId,
        workspaceId: workspace.id,
      },
      select: { id: true },
    });

    if (!existing) {
      return apiError("未找到可更新的内容日历项。", { status: 404 });
    }

    const item = await prisma.contentCalendarItem.update({
      where: { id: existing.id },
      data: {
        title: values.topic,
        platform: values.platform,
        scheduledAt,
        notes: values.notes || null,
      },
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
    });

    return apiSuccess(
      {
        message: "内容日历计划已更新。",
        item: {
          ...item,
          scheduledAt: item.scheduledAt.toISOString(),
          publishedAt: item.publishedAt?.toISOString() ?? null,
        },
      },
      "calendar/update",
      { workspaceId: workspace.id, itemId: item.id },
    );
  } catch (error) {
    return apiError("内容日历计划更新失败，请稍后重试。", {
      status: 500,
      scope: "calendar/update",
      error,
    });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    if (!process.env.DATABASE_URL) {
      return apiError(userMessages.databaseNotConfigured, {
        status: 500,
        scope: "calendar/delete",
        error: new Error("DATABASE_URL is not configured"),
      });
    }

    const { itemId } = await context.params;
    const { workspace, error } = await getTemporaryWorkspace();

    if (!workspace) {
      return apiError(getWorkspaceErrorMessage(error), { status: 404 });
    }

    const existing = await prisma.contentCalendarItem.findFirst({
      where: {
        id: itemId,
        workspaceId: workspace.id,
      },
      select: { id: true },
    });

    if (!existing) {
      return apiError("未找到可移除的内容日历项。", { status: 404 });
    }

    await prisma.contentCalendarItem.delete({
      where: { id: existing.id },
    });

    return apiSuccess(
      {
        message: "内容日历计划已移除。",
        itemId: existing.id,
      },
      "calendar/delete",
      { workspaceId: workspace.id, itemId: existing.id },
    );
  } catch (error) {
    return apiError("内容日历计划移除失败，请稍后重试。", {
      status: 500,
      scope: "calendar/delete",
      error,
    });
  }
}
