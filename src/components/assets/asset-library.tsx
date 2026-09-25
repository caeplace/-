"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AssetStatus, AssetType, ContentStatus, Platform } from "@prisma/client";
import {
  Archive,
  File,
  FileImage,
  FileText,
  Film,
  LinkIcon,
  Loader2,
  Pencil,
  Search,
  Sparkles,
  Tags,
} from "lucide-react";
import { AssetAnalyzeButton } from "@/components/assets/asset-analyze-button";
import { AssetStatusSelect } from "@/components/assets/asset-status-select";
import { AssetUploadDialog } from "@/components/assets/asset-upload-dialog";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast-provider";
import { getApiErrorMessage, parseApiPayload } from "@/lib/client-api";
import {
  assetStatusLabels,
  assetTypeLabels,
  contentStatusLabels,
  platformLabels,
} from "@/lib/labels";

type AssetStatusFilter = AssetStatus | "ALL";
type AssetTypeFilter = AssetType | "ALL";

type AssetUsageContent = {
  id: string;
  title: string;
  status: ContentStatus;
  platforms: Platform[];
  createdAt: string;
  calendarItems: Array<{
    id: string;
    status: ContentStatus;
    publishedAt: string | null;
    scheduledAt: string;
  }>;
};

export type AssetLibraryAsset = {
  id: string;
  title: string;
  description: string | null;
  url: string;
  fileName: string | null;
  fileType: string | null;
  fileUrl: string | null;
  thumbnailUrl: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  type: AssetType;
  status: AssetStatus;
  usageStatus: AssetStatus;
  tags: string[];
  aiDescription: string | null;
  productName: string | null;
  scene: string | null;
  visualStyle: string | null;
  suggestedUse: string | null;
  recommendedPlatforms: string[];
  createdAt: string;
  updatedAt: string;
  batch: {
    id: string;
    name: string;
  };
  generatedContents: AssetUsageContent[];
};

export type AssetLibraryBatch = {
  id: string;
  name: string;
  description: string | null;
  source: string | null;
  assetCount: number;
  updatedAt: string;
};

type AssetLibraryProps = {
  workspaceName: string;
  assets: AssetLibraryAsset[];
  batches: AssetLibraryBatch[];
  initialStatus?: AssetStatusFilter;
  initialType?: AssetTypeFilter;
  initialBatchId?: string;
  initialQuery?: string;
};

const statusFilterOptions: Array<{ value: AssetStatusFilter; label: string }> = [
  { value: "ALL", label: "全部状态" },
  { value: "UNUSED", label: "未使用" },
  { value: "USED", label: "已使用" },
  { value: "ARCHIVED", label: "已归档" },
];

const typeFilterOptions: Array<{ value: AssetTypeFilter; label: string }> = [
  { value: "ALL", label: "全部类型" },
  { value: "IMAGE", label: "图片" },
  { value: "VIDEO", label: "视频" },
  { value: "DOCUMENT", label: "文档" },
  { value: "LINK", label: "链接" },
  { value: "TEXT", label: "文本" },
];

function getAssetName(asset: AssetLibraryAsset) {
  return asset.fileName ?? asset.title;
}

function getAssetFileMeta(asset: AssetLibraryAsset) {
  return asset.fileType ?? asset.mimeType ?? assetTypeLabels[asset.type];
}

function getStatusVariant(status: AssetStatus) {
  if (status === "USED") return "default";
  if (status === "ARCHIVED") return "outline";
  return "secondary";
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatFileSize(value: number | null) {
  if (!value) return "未知大小";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function isPublishedUsage(content: AssetUsageContent) {
  return (
    content.status === "PUBLISHED" ||
    content.calendarItems.some((item) => item.status === "PUBLISHED")
  );
}

function getUsageHint(asset: AssetLibraryAsset) {
  const published = asset.generatedContents.some(isPublishedUsage);

  if (published) {
    return {
      label: "已发布使用",
      variant: "default" as const,
      isPublished: true,
    };
  }

  if (asset.generatedContents.length > 0) {
    return {
      label: "已用于草稿",
      variant: "accent" as const,
      isPublished: false,
    };
  }

  return {
    label: "未使用",
    variant: "outline" as const,
    isPublished: false,
  };
}

function AssetIcon({ type }: { type: AssetType }) {
  if (type === "IMAGE") return <FileImage className="size-5" />;
  if (type === "VIDEO") return <Film className="size-5" />;
  if (type === "DOCUMENT") return <FileText className="size-5" />;
  if (type === "LINK") return <LinkIcon className="size-5" />;
  return <File className="size-5" />;
}

function AssetPreview({ asset }: { asset: AssetLibraryAsset }) {
  const imageUrl =
    asset.type === "IMAGE" ? asset.thumbnailUrl ?? asset.fileUrl : null;

  if (imageUrl) {
    return (
      <div
        className="size-11 shrink-0 rounded-md border bg-muted bg-cover bg-center"
        style={{ backgroundImage: `url(${imageUrl})` }}
        aria-label={getAssetName(asset)}
      />
    );
  }

  return (
    <div className="flex size-11 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
      <AssetIcon type={asset.type} />
    </div>
  );
}

function assetMatchesQuery(asset: AssetLibraryAsset, query: string) {
  if (!query) return true;

  const text = [
    asset.title,
    asset.fileName,
    asset.description,
    asset.aiDescription,
    asset.productName,
    asset.scene,
    asset.batch.name,
    ...asset.tags,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return text.includes(query.toLowerCase());
}

function buildContentStudioHref(assetId: string) {
  return `/content-studio?assetIds=${encodeURIComponent(assetId)}`;
}

function ArchiveAssetButton({
  asset,
  onDone,
}: {
  asset: AssetLibraryAsset;
  onDone?: () => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  async function archiveAsset() {
    setIsSaving(true);

    try {
      const response = await fetch(`/api/assets/${asset.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ARCHIVED" }),
      });
      const payload = await parseApiPayload(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, "素材归档失败。"));
      }

      showToast({ type: "success", title: "素材已归档" });
      router.refresh();
      onDone?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "素材归档失败。";
      showToast({ type: "error", title: "归档失败", description: message });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={isSaving || asset.status === "ARCHIVED"}
      onClick={archiveAsset}
    >
      {isSaving ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Archive className="size-4" />
      )}
      {asset.status === "ARCHIVED" ? "已归档" : "归档"}
    </Button>
  );
}

function AssetTagsEditor({
  asset,
  onSaved,
}: {
  asset: AssetLibraryAsset;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [value, setValue] = useState(asset.tags.join("，"));
  const [isSaving, setIsSaving] = useState(false);

  async function saveTags() {
    const tags = value
      .split(/[,，\n]/)
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 20);

    setIsSaving(true);

    try {
      const response = await fetch(`/api/assets/${asset.id}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags }),
      });
      const payload = await parseApiPayload(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, "标签保存失败。"));
      }

      showToast({ type: "success", title: "标签已保存" });
      router.refresh();
      onSaved?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "标签保存失败。";
      showToast({ type: "error", title: "保存失败", description: message });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <label className="space-y-2 text-sm font-medium" htmlFor={`asset-tags-${asset.id}`}>
        标签
        <Textarea
          id={`asset-tags-${asset.id}`}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="用逗号分隔标签，例如：产品图，客厅，现代风"
          className="min-h-24"
        />
      </label>
      <div className="flex justify-end">
        <Button type="button" size="sm" disabled={isSaving} onClick={saveTags}>
          {isSaving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Tags className="size-4" />
          )}
          保存标签
        </Button>
      </div>
    </div>
  );
}

function AssetDetailDialog({
  asset,
  onOpenChange,
}: {
  asset: AssetLibraryAsset | null;
  onOpenChange: (open: boolean) => void;
}) {
  const usage = asset ? getUsageHint(asset) : null;

  return (
    <Dialog open={Boolean(asset)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
        {asset && usage ? (
          <>
            <DialogHeader>
              <DialogTitle className="break-words pr-8">
                {getAssetName(asset)}
              </DialogTitle>
              <DialogDescription>
                {assetTypeLabels[asset.type]} · {getAssetFileMeta(asset)} ·{" "}
                {formatFileSize(asset.sizeBytes)}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              <div className="flex flex-wrap gap-2">
                <Badge variant={getStatusVariant(asset.status)}>
                  {assetStatusLabels[asset.status]}
                </Badge>
                <Badge variant={usage.variant}>{usage.label}</Badge>
                <Badge variant="outline">{asset.batch.name}</Badge>
                <Badge variant="outline">
                  上传于 {formatShortDate(asset.createdAt)}
                </Badge>
              </div>

              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_15rem]">
                <div className="space-y-4">
                  <section className="rounded-md border bg-muted/20 p-4">
                    <h3 className="text-sm font-medium">AI 描述</h3>
                    <p className="mt-2 break-words text-sm leading-6 text-muted-foreground">
                      {asset.aiDescription ?? asset.description ?? "暂无 AI 描述。"}
                    </p>
                  </section>

                  <div className="grid gap-3 text-sm md:grid-cols-2">
                    <div>
                      <p className="font-medium">产品名</p>
                      <p className="mt-1 break-words text-muted-foreground">
                        {asset.productName ?? "未识别"}
                      </p>
                    </div>
                    <div>
                      <p className="font-medium">场景</p>
                      <p className="mt-1 break-words text-muted-foreground">
                        {asset.scene ?? "未识别"}
                      </p>
                    </div>
                    <div>
                      <p className="font-medium">推荐平台</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {asset.recommendedPlatforms.length > 0 ? (
                          asset.recommendedPlatforms.map((platform) => (
                            <Badge key={platform} variant="outline">
                              {platform}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-muted-foreground">暂无推荐</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="font-medium">建议用途</p>
                      <p className="mt-1 break-words text-muted-foreground">
                        {asset.suggestedUse ?? "暂无建议"}
                      </p>
                    </div>
                  </div>
                </div>

                <aside className="space-y-3 rounded-md border p-3">
                  <Button asChild className="w-full" size="sm">
                    <Link href={buildContentStudioHref(asset.id)}>
                      <Sparkles className="size-4" />
                      用于生成内容
                    </Link>
                  </Button>
                  <AssetAnalyzeButton
                    assetId={asset.id}
                    className="w-full"
                    size="sm"
                    showNotice={false}
                    variant="outline"
                  />
                  <ArchiveAssetButton asset={asset} />
                  <div className="border-t pt-3">
                    <p className="mb-2 text-sm font-medium">修改状态</p>
                    <AssetStatusSelect assetId={asset.id} status={asset.status} />
                  </div>
                </aside>
              </div>

              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">被哪些内容使用过</h3>
                  <Badge variant={usage.isPublished ? "default" : "outline"}>
                    {usage.isPublished ? "已发布：是" : "已发布：否"}
                  </Badge>
                </div>

                {asset.generatedContents.length > 0 ? (
                  <div className="space-y-2">
                    {asset.generatedContents.map((content) => {
                      const published = isPublishedUsage(content);

                      return (
                        <div key={content.id} className="rounded-md border p-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <p className="break-words text-sm font-medium">
                                {content.title}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {content.platforms
                                  .map((platform) => platformLabels[platform])
                                  .join("，") || "未设置平台"}
                                {" · "}
                                {formatShortDate(content.createdAt)}
                              </p>
                            </div>
                            <Badge variant={published ? "default" : "secondary"}>
                              {published
                                ? "已发布"
                                : contentStatusLabels[content.status]}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">
                    暂无内容使用该素材。
                  </div>
                )}
              </section>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AssetTagsDialog({
  asset,
  onOpenChange,
}: {
  asset: AssetLibraryAsset | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={Boolean(asset)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        {asset ? (
          <>
            <DialogHeader>
              <DialogTitle>编辑标签</DialogTitle>
              <DialogDescription>{getAssetName(asset)}</DialogDescription>
            </DialogHeader>
            <AssetTagsEditor asset={asset} onSaved={() => onOpenChange(false)} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                关闭
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function AssetLibrary({
  workspaceName,
  assets,
  batches,
  initialStatus = "ALL",
  initialType = "ALL",
  initialBatchId = "ALL",
  initialQuery = "",
}: AssetLibraryProps) {
  const [query, setQuery] = useState(initialQuery);
  const [statusFilter, setStatusFilter] =
    useState<AssetStatusFilter>(initialStatus);
  const [typeFilter, setTypeFilter] = useState<AssetTypeFilter>(initialType);
  const [batchId, setBatchId] = useState(initialBatchId || "ALL");
  const [detailAsset, setDetailAsset] = useState<AssetLibraryAsset | null>(null);
  const [tagsAsset, setTagsAsset] = useState<AssetLibraryAsset | null>(null);

  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      if (typeFilter !== "ALL" && asset.type !== typeFilter) return false;
      if (statusFilter !== "ALL" && asset.status !== statusFilter) return false;
      if (batchId !== "ALL" && asset.batch.id !== batchId) return false;
      return assetMatchesQuery(asset, query.trim());
    });
  }, [assets, batchId, query, statusFilter, typeFilter]);

  return (
    <div className="space-y-4">
      <section className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <AssetUploadDialog />

          <div className="flex min-w-0 flex-1 flex-col gap-3 md:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="pl-9"
                placeholder="搜索文件名、标签、产品、场景"
              />
            </div>

            <Select
              value={typeFilter}
              onValueChange={(value) => setTypeFilter(value as AssetTypeFilter)}
            >
              <SelectTrigger className="md:w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {typeFilterOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={statusFilter}
              onValueChange={(value) =>
                setStatusFilter(value as AssetStatusFilter)
              }
            >
              <SelectTrigger className="md:w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusFilterOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={batchId} onValueChange={setBatchId}>
              <SelectTrigger className="md:w-44">
                <SelectValue placeholder="全部批次" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部批次</SelectItem>
                {batches.map((batch) => (
                  <SelectItem key={batch.id} value={batch.id}>
                    {batch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>当前工作区：{workspaceName}</span>
          <span>·</span>
          <span>共 {assets.length} 个素材</span>
          <span>·</span>
          <span>显示 {filteredAssets.length} 个</span>
        </div>
      </section>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>素材列表</CardTitle>
          <CardDescription>
            默认只展示关键信息；AI 分析、用途和使用记录请点击详情查看。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredAssets.length > 0 ? (
            <div className="overflow-hidden rounded-md border">
              <div className="hidden grid-cols-[minmax(0,1.6fr)_7rem_12rem_9rem_7rem_28rem] gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground xl:grid">
                <span>文件名</span>
                <span>文件类型</span>
                <span>标签</span>
                <span>使用状态</span>
                <span>上传时间</span>
                <span className="text-right">操作</span>
              </div>

              <div className="divide-y">
                {filteredAssets.map((asset) => {
                  const usage = getUsageHint(asset);

                  return (
                    <div
                      key={asset.id}
                      className="grid gap-3 px-4 py-3 xl:grid-cols-[minmax(0,1.6fr)_7rem_12rem_9rem_7rem_28rem] xl:items-center"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <AssetPreview asset={asset} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {getAssetName(asset)}
                          </p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {asset.batch.name}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 xl:block">
                        <Badge variant="outline">{assetTypeLabels[asset.type]}</Badge>
                        <p className="mt-0 text-xs text-muted-foreground xl:mt-1">
                          {getAssetFileMeta(asset)}
                        </p>
                      </div>

                      <div className="flex min-w-0 flex-wrap gap-1.5">
                        {asset.tags.length > 0 ? (
                          <>
                            {asset.tags.slice(0, 3).map((tag) => (
                              <Badge
                                key={tag}
                                variant="outline"
                                className="max-w-24 truncate"
                              >
                                {tag}
                              </Badge>
                            ))}
                            {asset.tags.length > 3 ? (
                              <Badge variant="secondary">
                                +{asset.tags.length - 3}
                              </Badge>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            暂无标签
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant={getStatusVariant(asset.status)}>
                          {assetStatusLabels[asset.status]}
                        </Badge>
                        <Badge variant={usage.variant}>{usage.label}</Badge>
                      </div>

                      <p className="text-xs text-muted-foreground">
                        {formatShortDate(asset.createdAt)}
                      </p>

                      <div className="flex flex-wrap justify-start gap-2 xl:justify-end">
                        <Button asChild type="button" size="sm">
                          <Link href={buildContentStudioHref(asset.id)}>
                            <Sparkles className="size-4" />
                            用于生成内容
                          </Link>
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setDetailAsset(asset)}
                        >
                          查看详情
                        </Button>
                        <AssetAnalyzeButton
                          assetId={asset.id}
                          label="AI 分析"
                          size="sm"
                          showNotice={false}
                          variant="outline"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setTagsAsset(asset)}
                        >
                          <Pencil className="size-4" />
                          编辑标签
                        </Button>
                        <ArchiveAssetButton asset={asset} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-dashed bg-muted/20 p-10 text-center">
              <FileImage className="mx-auto mb-3 size-8 text-muted-foreground" />
              <p className="text-sm font-medium">没有匹配的素材</p>
              <p className="mt-2 text-sm text-muted-foreground">
                调整搜索或筛选条件，也可以上传新的素材。
              </p>
              <div className="mt-4 flex justify-center">
                <AssetUploadDialog />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <AssetDetailDialog
        asset={detailAsset}
        onOpenChange={(open) => {
          if (!open) setDetailAsset(null);
        }}
      />
      <AssetTagsDialog
        asset={tagsAsset}
        onOpenChange={(open) => {
          if (!open) setTagsAsset(null);
        }}
      />
    </div>
  );
}
