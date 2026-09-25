"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AssetStatus, AssetType, ContentStatus, Platform } from "@prisma/client";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Check,
  FileText,
  ImagePlus,
  Inbox,
  Search,
  Sparkles,
  X,
} from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  assetStatusLabels,
  assetTypeLabels,
  contentStatusLabels,
  platformLabels,
} from "@/lib/labels";
import { cn } from "@/lib/utils";

type DashboardAssetOption = {
  id: string;
  title: string;
  fileName: string | null;
  type: AssetType;
  status: AssetStatus;
  tags: string[];
  batch: {
    name: string;
  } | null;
};

type DashboardRecentContent = {
  id: string;
  title: string;
  platforms: Platform[];
  status: ContentStatus;
  updatedAt: string;
};

type DashboardHomeProps = {
  workspaceName: string;
  brandName: string | null;
  todo: {
    pendingPublishCount: number;
    unusedAssetCount: number;
    highRiskContentCount: number;
  };
  assets: DashboardAssetOption[];
  recentContents: DashboardRecentContent[];
};

const placeholderExamples = [
  "例如：用这批产品图生成一组 Instagram 新品发布文案",
  "例如：帮我根据新品卖点规划本周社媒内容",
  "例如：把这些素材整理成 TikTok 短视频脚本",
].join("\n");

function getAssetName(asset: DashboardAssetOption) {
  return asset.fileName ?? asset.title;
}

export function DashboardHome({
  workspaceName,
  brandName,
  todo,
  assets,
  recentContents,
}: DashboardHomeProps) {
  const router = useRouter();
  const [brief, setBrief] = useState("");
  const [assetDialogOpen, setAssetDialogOpen] = useState(false);
  const [assetSearch, setAssetSearch] = useState("");
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);

  const selectedAssets = useMemo(
    () => assets.filter((asset) => selectedAssetIds.includes(asset.id)),
    [assets, selectedAssetIds],
  );
  const filteredAssets = useMemo(() => {
    const keyword = assetSearch.trim().toLowerCase();

    if (!keyword) return assets;

    return assets.filter((asset) => {
      const haystack = [
        asset.title,
        asset.fileName,
        asset.batch?.name,
        asset.tags.join(" "),
        assetTypeLabels[asset.type],
        assetStatusLabels[asset.status],
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(keyword);
    });
  }, [assetSearch, assets]);

  const todoItems = [
    {
      label: "待发布内容",
      value: todo.pendingPublishCount,
      href: "/calendar",
      icon: CalendarClock,
      helper: "进入日历确认发布时间或标记发布。",
    },
    {
      label: "未使用素材",
      value: todo.unusedAssetCount,
      href: "/assets?status=UNUSED",
      icon: Inbox,
      helper: "挑选素材生成下一条内容。",
    },
    {
      label: "高风险内容",
      value: todo.highRiskContentCount,
      href: "/insights",
      icon: AlertTriangle,
      helper: "发布前建议复核措辞。",
    },
  ].filter((item) => item.value > 0);

  function toggleAsset(assetId: string) {
    setSelectedAssetIds((current) => {
      if (current.includes(assetId)) {
        return current.filter((id) => id !== assetId);
      }

      return [...current, assetId].slice(0, 12);
    });
  }

  function handleStartGenerate() {
    const params = new URLSearchParams();
    const nextBrief = brief.trim();

    if (nextBrief) params.set("brief", nextBrief);
    if (selectedAssetIds.length > 0) {
      params.set("assetIds", selectedAssetIds.join(","));
    }

    const suffix = params.toString();
    router.push(`/content-studio${suffix ? `?${suffix}` : ""}`);
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <section className="rounded-lg border bg-card p-5 shadow-sm md:p-6">
        <div className="grid gap-5 lg:grid-cols-[1fr_14rem]">
          <div className="space-y-4">
            <div className="space-y-2">
              <Badge variant="secondary" className="w-fit">
                {brandName ?? workspaceName}
              </Badge>
              <div>
                <h1 className="text-2xl font-semibold tracking-normal md:text-3xl">
                  今天想生成什么内容？
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  当前工作区：{workspaceName}。输入一句真实需求，云雀会带你继续创作。
                </p>
              </div>
            </div>

            <Textarea
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              placeholder={placeholderExamples}
              className="min-h-40 resize-none text-base leading-7"
            />

            <div className="rounded-md border bg-muted/25 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  已选素材
                </span>
                {selectedAssets.length > 0 ? (
                  selectedAssets.map((asset) => (
                    <button
                      key={asset.id}
                      type="button"
                      className="inline-flex max-w-52 items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs"
                      onClick={() => toggleAsset(asset.id)}
                    >
                      <span className="truncate">{getAssetName(asset)}</span>
                      <X className="size-3 text-muted-foreground" />
                    </button>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">
                    不选素材也可以生成；添加素材后内容会更贴合产品。
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <AssetUploadDialog
                triggerVariant="outline"
                triggerLabel="上传素材"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setAssetDialogOpen(true)}
              >
                <ImagePlus className="size-4" />
                选择已有素材
              </Button>
              <Button type="button" onClick={handleStartGenerate}>
                <Sparkles className="size-4" />
                开始生成
              </Button>
            </div>
          </div>

          <div className="rounded-md border bg-muted/30 p-4 text-sm">
            <p className="font-medium">创作状态</p>
            <p className="mt-2 leading-6 text-muted-foreground">
              {brandName
                ? `会参考「${brandName}」的品牌档案。`
                : "还没有品牌档案，生成时会使用通用品牌语气。"}
            </p>
            <Button className="mt-4 w-full" variant="outline" asChild>
              <Link href="/brand-profile">
                查看品牌档案
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle>今日待处理</CardTitle>
            <CardDescription>只保留需要你行动的事项。</CardDescription>
          </CardHeader>
          <CardContent>
            {todoItems.length > 0 ? (
              <div className="space-y-3">
                {todoItems.map((item) => {
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      className="flex items-center gap-3 rounded-md border bg-background p-3 transition-colors hover:bg-muted/50"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">
                          {item.label}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {item.helper}
                        </span>
                      </span>
                      <span className="text-lg font-semibold">{item.value}</span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-md border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                今天没有必须处理的事项，可以从上方输入框开始新的内容创作。
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>最近内容</CardTitle>
            <CardDescription>最近 3 条生成内容，方便继续编辑。</CardDescription>
          </CardHeader>
          <CardContent>
            {recentContents.length > 0 ? (
              <div className="divide-y rounded-md border">
                {recentContents.map((content) => (
                  <div
                    key={content.id}
                    className="flex flex-wrap items-center gap-3 p-3"
                  >
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {content.title}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {content.platforms.length > 0 ? (
                          content.platforms.map((platform) => (
                            <Badge key={platform} variant="secondary">
                              {platformLabels[platform]}
                            </Badge>
                          ))
                        ) : (
                          <Badge variant="secondary">通用</Badge>
                        )}
                        <Badge variant="outline">
                          {contentStatusLabels[content.status]}
                        </Badge>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <Link href="/content-studio">
                        继续编辑
                        <ArrowRight className="size-4" />
                      </Link>
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                还没有生成内容。写一句需求，先生成第一条草稿。
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <Dialog open={assetDialogOpen} onOpenChange={setAssetDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>选择已有素材</DialogTitle>
            <DialogDescription>
              选择最多 12 个素材，云雀会在内容生成页继续使用它们。
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={assetSearch}
              onChange={(event) => setAssetSearch(event.target.value)}
              placeholder="搜索文件名、标签、批次或类型"
              className="pl-9"
            />
          </div>

          {filteredAssets.length > 0 ? (
            <div className="grid gap-2">
              {filteredAssets.map((asset) => {
                const selected = selectedAssetIds.includes(asset.id);

                return (
                  <button
                    key={asset.id}
                    type="button"
                    className={cn(
                      "flex items-center gap-3 rounded-md border bg-background p-3 text-left transition-colors hover:bg-muted/50",
                      selected && "border-primary bg-primary/5",
                    )}
                    onClick={() => toggleAsset(asset.id)}
                  >
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-md border text-muted-foreground",
                        selected && "border-primary bg-primary text-primary-foreground",
                      )}
                    >
                      {selected ? (
                        <Check className="size-4" />
                      ) : (
                        <FileText className="size-4" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {getAssetName(asset)}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1.5">
                        <Badge variant="secondary">{assetTypeLabels[asset.type]}</Badge>
                        <Badge variant="outline">
                          {assetStatusLabels[asset.status]}
                        </Badge>
                        {asset.tags.slice(0, 3).map((tag) => (
                          <Badge key={tag} variant="outline">
                            {tag}
                          </Badge>
                        ))}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-md border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
              没有找到匹配素材。可以先上传素材，再回来选择。
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelectedAssetIds([])}
              disabled={selectedAssetIds.length === 0}
            >
              清空选择
            </Button>
            <Button type="button" onClick={() => setAssetDialogOpen(false)}>
              确认选择 {selectedAssetIds.length > 0 ? selectedAssetIds.length : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
