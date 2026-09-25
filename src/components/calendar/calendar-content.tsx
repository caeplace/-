"use client";

import { type FormEvent, useMemo, useState } from "react";
import type { ContentStatus, ContentType, Platform } from "@prisma/client";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Clock3,
  Eye,
  Loader2,
  Pencil,
  Send,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast-provider";
import { getApiErrorMessage, parseApiPayload } from "@/lib/client-api";
import {
  contentStatusLabels,
  contentTypeLabels,
  platformLabels,
} from "@/lib/labels";

type CalendarAsset = {
  id: string;
  title: string | null;
  fileName: string | null;
};

export type CalendarPlanItem = {
  id: string;
  title: string;
  description: string | null;
  platform: Platform;
  contentType: ContentType;
  status: ContentStatus;
  scheduledAt: string;
  publishedAt: string | null;
  ownerName: string | null;
  notes: string | null;
  generatedContentId: string | null;
  generatedContentTitle: string | null;
  generatedContentBody: string | null;
  generatedContentAssets: CalendarAsset[];
};

export type CalendarGeneratedContentOption = {
  id: string;
  title: string;
  body: string;
  type: ContentType;
  status: ContentStatus;
  platforms: Platform[];
  assets: CalendarAsset[];
};

type CalendarStatusFilter = ContentStatus | "ALL";

const statusFilters = [
  "ALL",
  "DRAFT",
  "SCHEDULED",
  "PUBLISHED",
  "ARCHIVED",
] as const satisfies readonly CalendarStatusFilter[];

const statusOptions = [
  "DRAFT",
  "SCHEDULED",
  "PUBLISHED",
  "ARCHIVED",
] as const satisfies readonly ContentStatus[];

const platformOptions = [
  "INSTAGRAM",
  "TIKTOK",
  "FACEBOOK",
  "PINTEREST",
  "LINKEDIN",
  "XIAOHONGSHU",
] as const satisfies readonly Platform[];

function getDefaultDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return toInputDate(date);
}

function toInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toInputTime(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

function getDayKey(date: Date) {
  return toInputDate(date);
}

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}`;
}

function getStatusLabel(status: CalendarStatusFilter) {
  return status === "ALL" ? "全部状态" : contentStatusLabels[status];
}

function getStatusVariant(
  status: ContentStatus,
): "default" | "secondary" | "outline" | "accent" {
  if (status === "PUBLISHED") return "default";
  if (status === "SCHEDULED") return "secondary";
  if (status === "DRAFT") return "outline";
  return "accent";
}

function formatDateOnly(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function formatTimeOnly(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function sortPlans(plans: CalendarPlanItem[]) {
  return [...plans].sort(
    (a, b) =>
      new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
  );
}

function getAssetName(asset: CalendarAsset) {
  return asset.fileName ?? asset.title ?? "未命名素材";
}

function isPlanFallback(
  fallback?: CalendarGeneratedContentOption | CalendarPlanItem | null,
): fallback is CalendarPlanItem {
  return Boolean(fallback && "scheduledAt" in fallback);
}

function normalizePlanFromApiItem(
  item: Partial<CalendarPlanItem> & {
    generatedContent?: {
      title?: string | null;
      body?: string | null;
      assets?: CalendarAsset[];
    } | null;
  },
  fallback?: CalendarGeneratedContentOption | CalendarPlanItem | null,
): CalendarPlanItem {
  const planFallback = isPlanFallback(fallback) ? fallback : null;
  const contentFallback = fallback && !isPlanFallback(fallback) ? fallback : null;

  return {
    id: item.id ?? fallback?.id ?? "",
    title: item.title ?? fallback?.title ?? "未命名主题",
    description: item.description ?? planFallback?.description ?? null,
    platform:
      item.platform ??
      planFallback?.platform ??
      contentFallback?.platforms[0] ??
      "XIAOHONGSHU",
    contentType:
      item.contentType ??
      planFallback?.contentType ??
      contentFallback?.type ??
      "POST",
    status: item.status ?? planFallback?.status ?? "SCHEDULED",
    scheduledAt:
      item.scheduledAt ?? planFallback?.scheduledAt ?? new Date().toISOString(),
    publishedAt: item.publishedAt ?? planFallback?.publishedAt ?? null,
    ownerName: item.ownerName ?? planFallback?.ownerName ?? null,
    notes: item.notes ?? planFallback?.notes ?? null,
    generatedContentId:
      item.generatedContentId ??
      planFallback?.generatedContentId ??
      contentFallback?.id ??
      null,
    generatedContentTitle:
      item.generatedContent?.title ??
      item.generatedContentTitle ??
      planFallback?.generatedContentTitle ??
      contentFallback?.title ??
      null,
    generatedContentBody:
      item.generatedContent?.body ??
      item.generatedContentBody ??
      planFallback?.generatedContentBody ??
      contentFallback?.body ??
      null,
    generatedContentAssets:
      item.generatedContent?.assets ??
      item.generatedContentAssets ??
      planFallback?.generatedContentAssets ??
      contentFallback?.assets ??
      [],
  };
}

export function CalendarContent({
  items,
  generatedContents,
  workspaceName,
}: {
  items: CalendarPlanItem[];
  generatedContents: CalendarGeneratedContentOption[];
  workspaceName: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [plans, setPlans] = useState(() => sortPlans(items));
  const [statusFilter, setStatusFilter] = useState<CalendarStatusFilter>("ALL");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    plans[0] ? new Date(plans[0].scheduledAt) : new Date(),
  );
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [detailItemId, setDetailItemId] = useState<string | null>(null);
  const [editItemId, setEditItemId] = useState<string | null>(null);
  const [selectedContentId, setSelectedContentId] = useState(
    generatedContents[0]?.id ?? "",
  );
  const [plannedDate, setPlannedDate] = useState(getDefaultDate);
  const [plannedTime, setPlannedTime] = useState("10:00");
  const [platform, setPlatform] = useState<Platform>(
    generatedContents[0]?.platforms[0] ?? "XIAOHONGSHU",
  );
  const [topic, setTopic] = useState(generatedContents[0]?.title ?? "");
  const [notes, setNotes] = useState("");
  const [editDate, setEditDate] = useState(getDefaultDate);
  const [editTime, setEditTime] = useState("10:00");
  const [editPlatform, setEditPlatform] = useState<Platform>("XIAOHONGSHU");
  const [editStatus, setEditStatus] = useState<ContentStatus>("SCHEDULED");
  const [editTopic, setEditTopic] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const selectedContent = useMemo(
    () =>
      generatedContents.find((content) => content.id === selectedContentId) ??
      generatedContents[0] ??
      null,
    [generatedContents, selectedContentId],
  );

  const visiblePlans = useMemo(
    () =>
      statusFilter === "ALL"
        ? plans
        : plans.filter((item) => item.status === statusFilter),
    [plans, statusFilter],
  );

  const plannedDates = useMemo(
    () => plans.map((item) => new Date(item.scheduledAt)),
    [plans],
  );

  const selectedDayPlans = useMemo(() => {
    const activeDay = getDayKey(selectedDate ?? new Date());
    return plans.filter(
      (plan) => getDayKey(new Date(plan.scheduledAt)) === activeDay,
    );
  }, [plans, selectedDate]);

  const selectedMonthPlans = useMemo(() => {
    const activeDate = selectedDate ?? new Date();
    const monthKey = getMonthKey(activeDate);
    return plans.filter(
      (plan) => getMonthKey(new Date(plan.scheduledAt)) === monthKey,
    );
  }, [plans, selectedDate]);

  const detailPlan = useMemo(
    () => plans.find((plan) => plan.id === detailItemId) ?? null,
    [detailItemId, plans],
  );
  const editPlan = useMemo(
    () => plans.find((plan) => plan.id === editItemId) ?? null,
    [editItemId, plans],
  );

  function handleContentChange(contentId: string) {
    const content = generatedContents.find((item) => item.id === contentId);
    setSelectedContentId(contentId);
    setTopic(content?.title ?? "");
    setPlatform(content?.platforms[0] ?? "XIAOHONGSHU");
  }

  function notifySuccess(message: string) {
    setSuccessMessage(message);
    showToast({ type: "success", title: "操作成功", description: message });
  }

  function notifyError(title: string, message: string) {
    setFormError(message);
    showToast({ type: "error", title, description: message });
  }

  function openEdit(plan: CalendarPlanItem) {
    const scheduledAt = new Date(plan.scheduledAt);
    setEditItemId(plan.id);
    setEditDate(toInputDate(scheduledAt));
    setEditTime(toInputTime(scheduledAt));
    setEditPlatform(plan.platform);
    setEditStatus(plan.status);
    setEditTopic(plan.title);
    setEditNotes(plan.notes ?? "");
    setFormError(null);
  }

  async function handleCreateCalendarItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

    if (!selectedContent) {
      setFormError("请先保存至少一条生成内容，再加入内容日历。");
      return;
    }

    setIsCreating(true);

    try {
      const response = await fetch("/api/calendar-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generatedContentId: selectedContent.id,
          plannedDate,
          plannedTime,
          platform,
          topic,
          notes,
        }),
      });
      const data = await parseApiPayload(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(data, "创建内容日历项失败。"));
      }

      const nextPlan = normalizePlanFromApiItem(data.item, selectedContent);

      setPlans((current) => sortPlans([...current, nextPlan]));
      setSelectedDate(new Date(nextPlan.scheduledAt));
      setCreateDialogOpen(false);
      setNotes("");
      notifySuccess("已加入内容日历。");
      router.refresh();
    } catch (error) {
      notifyError(
        "创建失败",
        error instanceof Error ? error.message : "创建内容日历项失败。",
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function updateCalendarStatus(
    itemId: string,
    nextStatus: ContentStatus,
    options: { showMessage?: boolean } = { showMessage: true },
  ) {
    const currentPlan = plans.find((plan) => plan.id === itemId);
    if (currentPlan?.status === nextStatus) return currentPlan ?? null;

    setUpdatingItemId(itemId);
    setFormError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/calendar-items/${itemId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await parseApiPayload(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(data, "更新日历状态失败。"));
      }

      const updatedPlan = normalizePlanFromApiItem(data.item, currentPlan);
      setPlans((current) =>
        sortPlans(
          current.map((plan) =>
            plan.id === updatedPlan.id ? updatedPlan : plan,
          ),
        ),
      );

      if (options.showMessage) {
        notifySuccess(
          nextStatus === "PUBLISHED"
            ? "已标记为发布，并同步更新内容与关联素材状态。"
            : "日历状态已更新。",
        );
      }

      router.refresh();
      return updatedPlan;
    } catch (error) {
      notifyError(
        "更新失败",
        error instanceof Error ? error.message : "更新日历状态失败。",
      );
      return null;
    } finally {
      setUpdatingItemId(null);
    }
  }

  async function handleUpdateCalendarItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editPlan) return;

    setIsEditing(true);
    setFormError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/calendar-items/${editPlan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plannedDate: editDate,
          plannedTime: editTime,
          platform: editPlatform,
          topic: editTopic,
          notes: editNotes,
        }),
      });
      const data = await parseApiPayload(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(data, "更新内容日历计划失败。"));
      }

      const updatedPlan = normalizePlanFromApiItem(data.item, editPlan);
      setPlans((current) =>
        sortPlans(
          current.map((plan) =>
            plan.id === updatedPlan.id ? updatedPlan : plan,
          ),
        ),
      );
      setSelectedDate(new Date(updatedPlan.scheduledAt));

      if (editStatus !== updatedPlan.status) {
        const statusPlan = await updateCalendarStatus(updatedPlan.id, editStatus, {
          showMessage: false,
        });
        if (!statusPlan) return;
      }

      setEditItemId(null);
      notifySuccess("内容日历计划已更新。");
      router.refresh();
    } catch (error) {
      notifyError(
        "更新失败",
        error instanceof Error ? error.message : "更新内容日历计划失败。",
      );
    } finally {
      setIsEditing(false);
    }
  }

  async function handleDeleteCalendarItem(plan: CalendarPlanItem) {
    const confirmed = window.confirm(
      "确定移除这条发布计划吗？已保存内容和素材不会被删除。",
    );
    if (!confirmed) return;

    setDeletingItemId(plan.id);
    setFormError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/calendar-items/${plan.id}`, {
        method: "DELETE",
      });
      const data = await parseApiPayload(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(data, "移除内容日历计划失败。"));
      }

      setPlans((current) => current.filter((item) => item.id !== plan.id));
      if (detailItemId === plan.id) setDetailItemId(null);
      if (editItemId === plan.id) setEditItemId(null);
      notifySuccess("内容日历计划已移除。");
      router.refresh();
    } catch (error) {
      notifyError(
        "移除失败",
        error instanceof Error ? error.message : "移除内容日历计划失败。",
      );
    } finally {
      setDeletingItemId(null);
    }
  }

  const createPlanDialog = (
    <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
      <DialogTrigger asChild>
        <Button>
          <CalendarPlus className="size-4" />
          添加计划
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>添加发布计划</DialogTitle>
          <DialogDescription>
            从已保存内容中选择一条，设置发布日期、时间和平台。
          </DialogDescription>
        </DialogHeader>
        {generatedContents.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
            还没有可加入日历的已保存内容。请先到内容生成页保存一条内容。
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleCreateCalendarItem}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm font-medium md:col-span-2">
                选择内容
                <Select
                  value={selectedContent?.id ?? ""}
                  onValueChange={handleContentChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择内容库中的生成内容" />
                  </SelectTrigger>
                  <SelectContent>
                    {generatedContents.map((content) => (
                      <SelectItem key={content.id} value={content.id}>
                        {content.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-2 text-sm font-medium">
                发布日期
                <Input
                  type="date"
                  value={plannedDate}
                  onChange={(event) => setPlannedDate(event.target.value)}
                  required
                />
              </label>
              <label className="space-y-2 text-sm font-medium">
                发布时间
                <Input
                  type="time"
                  value={plannedTime}
                  onChange={(event) => setPlannedTime(event.target.value)}
                  required
                />
              </label>
              <label className="space-y-2 text-sm font-medium">
                平台
                <Select
                  value={platform}
                  onValueChange={(value) => setPlatform(value as Platform)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {platformOptions.map((item) => (
                      <SelectItem key={item} value={item}>
                        {platformLabels[item]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-2 text-sm font-medium">
                内容标题
                <Input
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  placeholder="例如：新品上市预热"
                  required
                />
              </label>
              <label className="space-y-2 text-sm font-medium md:col-span-2">
                备注
                <Textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="可填写发布注意事项或协作说明。"
                  rows={3}
                />
              </label>
            </div>
            {selectedContent ? (
              <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                <div className="font-medium text-foreground">
                  {selectedContent.title}
                </div>
                <div className="mt-1 line-clamp-2">{selectedContent.body}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="outline">
                    {contentTypeLabels[selectedContent.type]}
                  </Badge>
                  <Badge variant="secondary">
                    {selectedContent.assets.length} 个关联素材
                  </Badge>
                </div>
              </div>
            ) : null}
            {formError ? (
              <p className="text-sm text-destructive">{formError}</p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateDialogOpen(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={isCreating || !selectedContent}>
                {isCreating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CalendarPlus className="size-4" />
                )}
                创建计划
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-primary">
              Content Calendar
            </p>
            <h1 className="mt-1 text-2xl font-semibold">
              {workspaceName} 内容日历
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              只管理内容计划、发布时间和发布状态。
            </p>
          </div>
          {createPlanDialog}
        </div>
      </div>

      {successMessage ? (
        <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary">
          <CheckCircle2 className="size-4" />
          {successMessage}
        </div>
      ) : null}
      {formError && !createDialogOpen && !editPlan ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {formError}
        </div>
      ) : null}

      <Tabs defaultValue="list" className="space-y-4">
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 md:flex-row md:items-center md:justify-between">
          <TabsList>
            <TabsTrigger value="list">列表视图</TabsTrigger>
            <TabsTrigger value="month">月历视图</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <Select
              value={statusFilter}
              onValueChange={(value) =>
                setStatusFilter(value as CalendarStatusFilter)
              }
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusFilters.map((item) => (
                  <SelectItem key={item} value={item}>
                    {getStatusLabel(item)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <TabsContent value="list">
          <Card>
            <CardHeader>
              <CardTitle>发布计划</CardTitle>
              <CardDescription>
                按日期管理内容标题、平台、状态和关联素材。
              </CardDescription>
            </CardHeader>
            <CardContent>
              {visiblePlans.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>发布日期</TableHead>
                        <TableHead>时间</TableHead>
                        <TableHead>平台</TableHead>
                        <TableHead>内容标题</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead className="text-right">关联素材</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visiblePlans.map((plan) => (
                        <TableRow key={plan.id}>
                          <TableCell className="whitespace-nowrap">
                            {formatDateOnly(plan.scheduledAt)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <span className="inline-flex items-center gap-1">
                              <Clock3 className="size-3.5 text-muted-foreground" />
                              {formatTimeOnly(plan.scheduledAt)}
                            </span>
                          </TableCell>
                          <TableCell>{platformLabels[plan.platform]}</TableCell>
                          <TableCell className="min-w-64">
                            <button
                              type="button"
                              className="text-left font-medium hover:text-primary"
                              onClick={() => setDetailItemId(plan.id)}
                            >
                              {plan.generatedContentTitle ?? plan.title}
                            </button>
                          </TableCell>
                          <TableCell>
                            <Badge variant={getStatusVariant(plan.status)}>
                              {contentStatusLabels[plan.status]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {plan.generatedContentAssets.length}
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                title="查看内容"
                                onClick={() => setDetailItemId(plan.id)}
                              >
                                <Eye className="size-4" />
                              </Button>
                              <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                title="编辑计划"
                                onClick={() => openEdit(plan)}
                              >
                                <Pencil className="size-4" />
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                disabled={
                                  plan.status === "PUBLISHED" ||
                                  updatingItemId === plan.id
                                }
                                onClick={() =>
                                  updateCalendarStatus(plan.id, "PUBLISHED")
                                }
                              >
                                {updatingItemId === plan.id ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <Send className="size-4" />
                                )}
                                标记已发布
                              </Button>
                              <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                title="移除计划"
                                disabled={deletingItemId === plan.id}
                                onClick={() => handleDeleteCalendarItem(plan)}
                              >
                                {deletingItemId === plan.id ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <Trash2 className="size-4" />
                                )}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="rounded-md border border-dashed p-8 text-center">
                  <div className="text-sm font-medium">
                    {plans.length === 0 ? "还没有发布计划" : "暂无匹配计划"}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {plans.length === 0
                      ? "从已保存内容添加第一条计划后，会出现在这里。"
                      : "可以切换状态筛选，或添加新的发布计划。"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="month">
          <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
            <Card className="self-start">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="size-4 text-primary" />
                  月历视图
                </CardTitle>
                <CardDescription>点击日期查看当天计划。</CardDescription>
              </CardHeader>
              <CardContent>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => setSelectedDate(date)}
                  defaultMonth={selectedDate}
                  modifiers={{ planned: plannedDates }}
                  modifiersClassNames={{
                    planned: "border border-primary/50 bg-primary/5",
                  }}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  {selectedDate
                    ? `${formatDateOnly(selectedDate.toISOString())} 的计划`
                    : "当天计划"}
                </CardTitle>
                <CardDescription>
                  本月共 {selectedMonthPlans.length} 条计划。
                </CardDescription>
              </CardHeader>
              <CardContent>
                {selectedDayPlans.length > 0 ? (
                  <div className="space-y-3">
                    {selectedDayPlans.map((plan) => (
                      <div
                        key={plan.id}
                        className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">
                              {formatTimeOnly(plan.scheduledAt)}
                            </Badge>
                            <Badge variant="secondary">
                              {platformLabels[plan.platform]}
                            </Badge>
                            <Badge variant={getStatusVariant(plan.status)}>
                              {contentStatusLabels[plan.status]}
                            </Badge>
                          </div>
                          <button
                            type="button"
                            className="mt-2 text-left font-medium hover:text-primary"
                            onClick={() => setDetailItemId(plan.id)}
                          >
                            {plan.generatedContentTitle ?? plan.title}
                          </button>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {plan.generatedContentAssets.length} 个关联素材
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openEdit(plan)}
                          >
                            <Pencil className="size-4" />
                            编辑计划
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={
                              plan.status === "PUBLISHED" ||
                              updatingItemId === plan.id
                            }
                            onClick={() =>
                              updateCalendarStatus(plan.id, "PUBLISHED")
                            }
                          >
                            标记已发布
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                    这一天还没有内容计划。
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog
        open={Boolean(detailPlan)}
        onOpenChange={(open) => {
          if (!open) setDetailItemId(null);
        }}
      >
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
          {detailPlan ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {detailPlan.generatedContentTitle ?? detailPlan.title}
                </DialogTitle>
                <DialogDescription>
                  {formatDateOnly(detailPlan.scheduledAt)} ·{" "}
                  {formatTimeOnly(detailPlan.scheduledAt)} ·{" "}
                  {platformLabels[detailPlan.platform]}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant={getStatusVariant(detailPlan.status)}>
                    {contentStatusLabels[detailPlan.status]}
                  </Badge>
                  <Badge variant="outline">
                    {contentTypeLabels[detailPlan.contentType]}
                  </Badge>
                  <Badge variant="secondary">
                    {detailPlan.generatedContentAssets.length} 个关联素材
                  </Badge>
                </div>

                <div className="rounded-md border p-4">
                  <p className="text-sm font-medium">内容正文</p>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                    {detailPlan.generatedContentBody ??
                      detailPlan.description ??
                      "暂无正文。"}
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-md border p-4">
                    <p className="text-sm font-medium">关联素材</p>
                    {detailPlan.generatedContentAssets.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {detailPlan.generatedContentAssets.map((asset) => (
                          <Badge key={asset.id} variant="outline">
                            {getAssetName(asset)}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">
                        暂无关联素材。
                      </p>
                    )}
                  </div>
                  <div className="rounded-md border p-4">
                    <p className="text-sm font-medium">备注</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                      {detailPlan.notes || "暂无备注。"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => openEdit(detailPlan)}
                  >
                    <Pencil className="size-4" />
                    编辑计划
                  </Button>
                  <Button
                    type="button"
                    disabled={
                      detailPlan.status === "PUBLISHED" ||
                      updatingItemId === detailPlan.id
                    }
                    onClick={() =>
                      updateCalendarStatus(detailPlan.id, "PUBLISHED")
                    }
                  >
                    <Send className="size-4" />
                    标记已发布
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editPlan)}
        onOpenChange={(open) => {
          if (!open) setEditItemId(null);
        }}
      >
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>编辑发布计划</DialogTitle>
            <DialogDescription>
              调整发布时间、平台、标题和当前状态。
            </DialogDescription>
          </DialogHeader>
          {editPlan ? (
            <form className="space-y-4" onSubmit={handleUpdateCalendarItem}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm font-medium">
                  发布日期
                  <Input
                    type="date"
                    value={editDate}
                    onChange={(event) => setEditDate(event.target.value)}
                    required
                  />
                </label>
                <label className="space-y-2 text-sm font-medium">
                  发布时间
                  <Input
                    type="time"
                    value={editTime}
                    onChange={(event) => setEditTime(event.target.value)}
                    required
                  />
                </label>
                <label className="space-y-2 text-sm font-medium">
                  平台
                  <Select
                    value={editPlatform}
                    onValueChange={(value) => setEditPlatform(value as Platform)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {platformOptions.map((item) => (
                        <SelectItem key={item} value={item}>
                          {platformLabels[item]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="space-y-2 text-sm font-medium">
                  状态
                  <Select
                    value={editStatus}
                    onValueChange={(value) =>
                      setEditStatus(value as ContentStatus)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((item) => (
                        <SelectItem key={item} value={item}>
                          {contentStatusLabels[item]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="space-y-2 text-sm font-medium md:col-span-2">
                  内容标题
                  <Input
                    value={editTopic}
                    onChange={(event) => setEditTopic(event.target.value)}
                    required
                  />
                </label>
                <label className="space-y-2 text-sm font-medium md:col-span-2">
                  备注
                  <Textarea
                    value={editNotes}
                    onChange={(event) => setEditNotes(event.target.value)}
                    rows={3}
                  />
                </label>
              </div>
              {formError ? (
                <p className="text-sm text-destructive">{formError}</p>
              ) : null}
              <DialogFooter className="gap-2 sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  disabled={deletingItemId === editPlan.id}
                  onClick={() => handleDeleteCalendarItem(editPlan)}
                >
                  {deletingItemId === editPlan.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                  移除计划
                </Button>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditItemId(null)}
                  >
                    取消
                  </Button>
                  <Button type="submit" disabled={isEditing}>
                    {isEditing ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-4" />
                    )}
                    保存修改
                  </Button>
                </div>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
