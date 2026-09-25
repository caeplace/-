"use client";

import { type FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ContentStatus, ContentType, Platform } from "@prisma/client";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Copy,
  Eye,
  FileImage,
  Loader2,
  Pencil,
  Save,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UploadCloud,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast-provider";
import { getApiErrorMessage, parseApiPayload } from "@/lib/client-api";
import {
  contentStatusLabels,
  contentTypeLabels,
  formatDateTime,
  platformLabels,
} from "@/lib/labels";
import type { ComplianceCheckResult } from "@/lib/prompts/compliance-check";
import type {
  ContentGenerationFormValues,
  ContentOutputLanguage,
  GeneratedContentVariantValues,
} from "@/lib/validators/content-studio";

type AssetOption = {
  id: string;
  title: string;
  fileName: string | null;
  type: string;
  tags: string[];
  aiDescription: string | null;
  productName: string | null;
  scene: string | null;
};

type RecentContentItem = {
  id: string;
  title: string;
  body: string;
  status: ContentStatus;
  platforms: Platform[];
  type: ContentType;
  hashtags: string[];
  callToAction: string | null;
  createdAt: string;
  riskNotes: ComplianceCheckResult | null;
  assets: Array<{
    id: string;
    title: string;
    fileName: string | null;
  }>;
};

type NoticeState = {
  type: "success" | "error" | "info";
  message: string;
} | null;

type ContentGeneratorProps = {
  workspaceName: string;
  brandName: string | null;
  brandTone: string | null;
  assets: AssetOption[];
  recentContents: RecentContentItem[];
  initialSelectedAssetIds?: string[];
  initialCreativeBrief?: string;
};

type PlatformChoice = Platform | "AUTO";

const platformOptions = [
  "INSTAGRAM",
  "TIKTOK",
  "FACEBOOK",
  "PINTEREST",
  "LINKEDIN",
  "XIAOHONGSHU",
] as Platform[];

const contentTypeOptions = [
  "POST",
  "CAROUSEL",
  "SHORT_VIDEO_SCRIPT",
  "STORY",
  "AD_COPY",
] as ContentType[];

const outputLanguageOptions = [
  { value: "ZH_CN", label: "中文" },
  { value: "EN_WITH_ZH", label: "英文 + 中文对照" },
] as const;

const outputLanguageLabels: Record<ContentOutputLanguage, string> = {
  ZH_CN: "中文",
  EN_WITH_ZH: "英文 + 中文对照",
};

const defaultForm: ContentGenerationFormValues = {
  platform: "XIAOHONGSHU",
  contentType: "POST",
  marketingGoal: "",
  selectedAssets: [],
  tone: "清爽、可信、克制，像朋友分享真实体验",
  numberOfVariants: 3,
  outputLanguage: "ZH_CN",
  extraInstructions: "",
};

function isPlatform(value: string): value is Platform {
  return (platformOptions as readonly string[]).includes(value);
}

function isContentType(value: string): value is ContentType {
  return (contentTypeOptions as readonly string[]).includes(value);
}

function isOutputLanguage(value: string): value is ContentOutputLanguage {
  return outputLanguageOptions.some((option) => option.value === value);
}

function validateGenerationForm(
  values: ContentGenerationFormValues,
):
  | { ok: true; data: ContentGenerationFormValues }
  | { ok: false; message: string } {
  const platform = String(values.platform);
  const contentType = String(values.contentType);
  const marketingGoal = values.marketingGoal.trim();
  const tone = values.tone.trim();
  const extraInstructions = values.extraInstructions.trim();
  const numberOfVariants = Number(values.numberOfVariants);
  const selectedAssets = values.selectedAssets.filter(Boolean).slice(0, 12);
  const outputLanguage = String(values.outputLanguage);

  if (!isPlatform(platform)) {
    return { ok: false, message: "请选择生成平台。" };
  }

  if (!isContentType(contentType)) {
    return { ok: false, message: "请选择内容类型。" };
  }

  if (marketingGoal.length < 2) {
    return { ok: false, message: "请先告诉云雀你想生成什么内容。" };
  }

  if (marketingGoal.length > 800) {
    return { ok: false, message: "创作需求最多 800 个字。" };
  }

  if (
    !Number.isInteger(numberOfVariants) ||
    numberOfVariants < 1 ||
    numberOfVariants > 5
  ) {
    return { ok: false, message: "生成数量需要在 1 到 5 之间。" };
  }

  if (tone.length > 120) {
    return { ok: false, message: "语气描述最多 120 个字。" };
  }

  if (extraInstructions.length > 1000) {
    return { ok: false, message: "额外要求最多 1000 个字。" };
  }

  if (!isOutputLanguage(outputLanguage)) {
    return { ok: false, message: "请选择输出语言。" };
  }

  return {
    ok: true,
    data: {
      platform,
      contentType,
      marketingGoal,
      selectedAssets,
      tone,
      numberOfVariants,
      outputLanguage,
      extraInstructions,
    },
  };
}

function getAssetName(asset: AssetOption) {
  return asset.fileName ?? asset.title;
}

function getRiskBadgeVariant(riskLevel?: "low" | "medium" | "high") {
  if (riskLevel === "high") return "default";
  if (riskLevel === "medium") return "accent";
  return "secondary";
}

function getRiskLabel(riskLevel?: "low" | "medium" | "high") {
  if (riskLevel === "high") return "高风险";
  if (riskLevel === "medium") return "中风险";
  if (riskLevel === "low") return "低风险";
  return "未检查";
}

function getDefaultCalendarValue() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(10, 0, 0, 0);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function inferPlatformFromBrief(brief: string): Platform | null {
  const text = brief.toLowerCase();

  if (text.includes("instagram") || text.includes("ins") || text.includes("ig")) {
    return "INSTAGRAM";
  }

  if (text.includes("tiktok") || text.includes("抖音")) {
    return "TIKTOK";
  }

  if (text.includes("facebook") || text.includes("fb")) {
    return "FACEBOOK";
  }

  if (text.includes("pinterest")) {
    return "PINTEREST";
  }

  if (text.includes("linkedin") || text.includes("领英")) {
    return "LINKEDIN";
  }

  if (
    text.includes("小红书") ||
    text.includes("xiaohongshu") ||
    text.includes("red book") ||
    text.includes("rednote")
  ) {
    return "XIAOHONGSHU";
  }

  return null;
}

function formatVariantText(variant: GeneratedContentVariantValues) {
  const tags =
    variant.hashtags.length > 0 ? `\n\n${variant.hashtags.join(" ")}` : "";

  return `${variant.title}\n\n${variant.hook}\n\n${variant.body}\n\n${variant.cta}${tags}`;
}

function getAssetHint(asset: AssetOption) {
  if (asset.productName || asset.scene) {
    return [asset.productName, asset.scene].filter(Boolean).join(" · ");
  }

  if (asset.aiDescription) return asset.aiDescription;
  if (asset.tags.length > 0) return asset.tags.slice(0, 4).join("，");
  return "未分析素材";
}

export function ContentGenerator({
  workspaceName,
  brandName,
  brandTone,
  assets,
  recentContents,
  initialSelectedAssetIds = [],
  initialCreativeBrief = "",
}: ContentGeneratorProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [creativeBrief, setCreativeBrief] = useState(initialCreativeBrief);
  const [platformChoice, setPlatformChoice] = useState<PlatformChoice>("AUTO");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [assetDialogOpen, setAssetDialogOpen] = useState(false);
  const [form, setForm] = useState<ContentGenerationFormValues>(() => {
    const availableAssetIds = new Set(assets.map((asset) => asset.id));
    const selectedAssets = initialSelectedAssetIds
      .filter((assetId) => availableAssetIds.has(assetId))
      .slice(0, 12);

    return {
      ...defaultForm,
      selectedAssets,
    };
  });
  const [lastGenerationForm, setLastGenerationForm] =
    useState<ContentGenerationFormValues | null>(null);
  const [lastPlatformChoice, setLastPlatformChoice] =
    useState<PlatformChoice>("AUTO");
  const [variants, setVariants] = useState<GeneratedContentVariantValues[]>([]);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [savedIndexes, setSavedIndexes] = useState<number[]>([]);
  const [savedContentIds, setSavedContentIds] = useState<Record<number, string>>(
    {},
  );
  const [detailsContent, setDetailsContent] = useState<RecentContentItem | null>(
    null,
  );
  const [editingContent, setEditingContent] = useState<RecentContentItem | null>(
    null,
  );
  const [editingVariantIndex, setEditingVariantIndex] = useState<number | null>(
    null,
  );
  const [calendarContent, setCalendarContent] = useState<RecentContentItem | null>(
    null,
  );
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [variantEditTitle, setVariantEditTitle] = useState("");
  const [variantEditBody, setVariantEditBody] = useState("");
  const [calendarScheduledAt, setCalendarScheduledAt] = useState(
    getDefaultCalendarValue,
  );
  const [calendarOwnerName, setCalendarOwnerName] = useState("");
  const [calendarNotes, setCalendarNotes] = useState("");
  const [actionContentId, setActionContentId] = useState<string | null>(null);

  const selectedAssetDetails = useMemo(
    () => assets.filter((asset) => form.selectedAssets.includes(asset.id)),
    [assets, form.selectedAssets],
  );

  const generatedAssetDetails = useMemo(() => {
    const selectedIds = lastGenerationForm?.selectedAssets ?? form.selectedAssets;
    return assets.filter((asset) => selectedIds.includes(asset.id));
  }, [assets, form.selectedAssets, lastGenerationForm]);

  function notify(
    type: "success" | "error" | "info",
    title: string,
    message: string,
  ) {
    setNotice({ type, message });
    showToast({ type, title, description: message });
  }

  function updateForm<K extends keyof ContentGenerationFormValues>(
    key: K,
    value: ContentGenerationFormValues[K],
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handlePlatformChoiceChange(value: string) {
    const nextChoice = value as PlatformChoice;
    setPlatformChoice(nextChoice);

    if (nextChoice !== "AUTO") {
      updateForm("platform", nextChoice);
    }
  }

  function toggleAsset(assetId: string) {
    setForm((current) => {
      const exists = current.selectedAssets.includes(assetId);
      return {
        ...current,
        selectedAssets: exists
          ? current.selectedAssets.filter((id) => id !== assetId)
          : [...current.selectedAssets, assetId].slice(0, 12),
      };
    });
  }

  function buildGenerationValues() {
    const userBrief = creativeBrief.trim();
    const advancedGoal = form.marketingGoal.trim();
    const marketingGoal = [
      userBrief,
      advancedGoal ? `补充营销目标：${advancedGoal}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const inferredPlatform =
      platformChoice === "AUTO"
        ? inferPlatformFromBrief(userBrief) ?? form.platform
        : platformChoice;
    const helperNotes = [
      platformChoice === "AUTO"
        ? "用户没有手动固定平台。请根据需求和品牌资料判断最适合的平台；如果需求没有明确平台，请生成适合多平台复用的通用社媒版本，并在 platformNotes 中说明推荐平台。"
        : "",
      form.selectedAssets.length === 0
        ? "用户没有选择素材。请基于品牌档案和品牌记忆生成，并让素材建议保持通用、可执行。"
        : "",
    ].filter(Boolean);
    const extraInstructions = [form.extraInstructions.trim(), ...helperNotes]
      .filter(Boolean)
      .join("\n\n");

    return validateGenerationForm({
      ...form,
      platform: inferredPlatform,
      marketingGoal,
      extraInstructions,
    });
  }

  async function handleGenerate(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (isGenerating) return;

    const parsed = buildGenerationValues();

    if (!parsed.ok) {
      notify("error", "还缺一点信息", parsed.message);
      return;
    }

    if (form.selectedAssets.length === 0) {
      notify(
        "info",
        "可以直接生成",
        "当前没有选择素材；添加素材后内容会更贴合具体产品。",
      );
    } else {
      setNotice({
        type: "info",
        message: "正在生成内容并进行合规检查，通常需要 10-30 秒，请稍候。",
      });
    }

    setSavedIndexes([]);
    setSavedContentIds({});
    setVariants([]);
    setIsGenerating(true);
    setLastGenerationForm(parsed.data);
    setLastPlatformChoice(platformChoice);

    try {
      const response = await fetch("/api/content-studio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const payload = await parseApiPayload(response);

      if (!response.ok) {
        notify(
          "error",
          "生成失败",
          getApiErrorMessage(payload, "内容生成失败，请稍后再试。"),
        );
        return;
      }

      const nextVariants = payload.variants ?? [];
      setVariants(nextVariants);

      if (nextVariants.length === 0) {
        notify("error", "生成失败", "AI 没有返回可展示的内容，请调整需求后重试。");
        return;
      }

      notify(
        "success",
        "生成完成",
        typeof payload.message === "string" ? payload.message : "内容已生成。",
      );
    } catch {
      notify("error", "生成失败", "网络暂时不可用，内容生成失败。");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSave(
    variant: GeneratedContentVariantValues,
    index: number,
  ) {
    const generationForm = lastGenerationForm;

    if (!generationForm) {
      notify("error", "保存失败", "请先生成内容，再保存到内容库。");
      return;
    }

    setNotice(null);
    setSavingIndex(index);

    try {
      const response = await fetch("/api/content-studio/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...generationForm,
          variant,
        }),
      });
      const payload = await parseApiPayload(response);

      if (!response.ok) {
        notify(
          "error",
          "保存失败",
          getApiErrorMessage(payload, "保存失败，请稍后再试。"),
        );
        return;
      }

      const contentId =
        payload.content && typeof payload.content.id === "string"
          ? payload.content.id
          : null;

      setSavedIndexes((current) => [...new Set([...current, index])]);
      if (contentId) {
        setSavedContentIds((current) => ({ ...current, [index]: contentId }));
      }
      notify(
        "success",
        "保存成功",
        typeof payload.message === "string" ? payload.message : "内容已保存。",
      );
      router.refresh();
    } catch {
      notify("error", "保存失败", "网络暂时不可用，内容保存失败。");
    } finally {
      setSavingIndex(null);
    }
  }

  async function handleCopy(content: RecentContentItem) {
    try {
      await navigator.clipboard.writeText(content.body);
      notify("success", "复制成功", "正文已复制。");
    } catch {
      notify("error", "复制失败", "请手动选中正文复制。");
    }
  }

  async function handleCopyVariant(variant: GeneratedContentVariantValues) {
    try {
      await navigator.clipboard.writeText(formatVariantText(variant));
      notify("success", "复制成功", "生成内容已复制。");
    } catch {
      notify("error", "复制失败", "请手动选中内容复制。");
    }
  }

  function openEdit(content: RecentContentItem) {
    setEditingContent(content);
    setEditTitle(content.title);
    setEditBody(content.body);
  }

  function openVariantEdit(
    variant: GeneratedContentVariantValues,
    index: number,
  ) {
    setEditingVariantIndex(index);
    setVariantEditTitle(variant.title);
    setVariantEditBody(variant.body);
  }

  function handleUpdateVariant() {
    if (editingVariantIndex === null) return;

    setVariants((current) =>
      current.map((variant, index) =>
        index === editingVariantIndex
          ? {
              ...variant,
              title: variantEditTitle.trim() || variant.title,
              body: variantEditBody.trim() || variant.body,
            }
          : variant,
      ),
    );
    setEditingVariantIndex(null);
    notify("success", "已更新", "生成结果已在当前页面更新，保存后会写入内容库。");
  }

  function openCalendar(content: RecentContentItem) {
    setCalendarContent(content);
    setCalendarScheduledAt(getDefaultCalendarValue());
    setCalendarOwnerName("");
    setCalendarNotes("");
  }

  function openGeneratedVariantCalendar(
    variant: GeneratedContentVariantValues,
    index: number,
  ) {
    const contentId = savedContentIds[index];
    const generationForm = lastGenerationForm;

    if (!contentId || !generationForm) {
      notify("info", "先保存内容", "保存到内容库后，就可以加入内容日历。");
      return;
    }

    openCalendar({
      id: contentId,
      title: variant.title,
      body: `${variant.hook}\n\n${variant.body}`,
      status: "DRAFT",
      platforms: [generationForm.platform],
      type: generationForm.contentType,
      hashtags: variant.hashtags,
      callToAction: variant.cta,
      createdAt: new Date().toISOString(),
      riskNotes: variant.complianceCheck ?? null,
      assets: generatedAssetDetails.map((asset) => ({
        id: asset.id,
        title: asset.title,
        fileName: asset.fileName,
      })),
    });
  }

  async function handleUpdateContent() {
    if (!editingContent) return;

    setNotice(null);
    setActionContentId(editingContent.id);

    try {
      const response = await fetch(`/api/content-studio/${editingContent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle,
          body: editBody,
        }),
      });
      const payload = await parseApiPayload(response);

      if (!response.ok) {
        notify(
          "error",
          "更新失败",
          getApiErrorMessage(payload, "更新失败，请稍后再试。"),
        );
        return;
      }

      setEditingContent(null);
      notify(
        "success",
        "更新成功",
        typeof payload.message === "string" ? payload.message : "内容已更新。",
      );
      router.refresh();
    } catch {
      notify("error", "更新失败", "网络暂时不可用，内容更新失败。");
    } finally {
      setActionContentId(null);
    }
  }

  async function handleDeleteContent(content: RecentContentItem) {
    if (!window.confirm(`确定删除「${content.title}」吗？`)) return;

    setNotice(null);
    setActionContentId(content.id);

    try {
      const response = await fetch(`/api/content-studio/${content.id}`, {
        method: "DELETE",
      });
      const payload = await parseApiPayload(response);

      if (!response.ok) {
        notify(
          "error",
          "删除失败",
          getApiErrorMessage(payload, "删除失败，请稍后再试。"),
        );
        return;
      }

      notify(
        "success",
        "删除成功",
        typeof payload.message === "string" ? payload.message : "内容已删除。",
      );
      router.refresh();
    } catch {
      notify("error", "删除失败", "网络暂时不可用，内容删除失败。");
    } finally {
      setActionContentId(null);
    }
  }

  async function handleAddToCalendar() {
    if (!calendarContent) return;

    setNotice(null);
    setActionContentId(calendarContent.id);

    try {
      const response = await fetch(
        `/api/content-studio/${calendarContent.id}/calendar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scheduledAt: new Date(calendarScheduledAt).toISOString(),
            ownerName: calendarOwnerName,
            notes: calendarNotes,
          }),
        },
      );
      const payload = await parseApiPayload(response);

      if (!response.ok) {
        notify(
          "error",
          "加入日历失败",
          getApiErrorMessage(payload, "加入日历失败，请稍后再试。"),
        );
        return;
      }

      setCalendarContent(null);
      notify(
        "success",
        "已加入日历",
        typeof payload.message === "string"
          ? payload.message
          : "已加入内容日历。",
      );
      router.refresh();
    } catch {
      notify("error", "加入日历失败", "网络暂时不可用，加入日历失败。");
    } finally {
      setActionContentId(null);
    }
  }

  const generationPlatformLabel = lastGenerationForm
    ? platformLabels[lastGenerationForm.platform]
    : "AI 自动推荐";

  return (
    <div className="space-y-5">
      {notice ? (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            notice.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : notice.type === "info"
                ? "border-primary/20 bg-primary/5 text-foreground"
                : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          {notice.message}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
        <Card className="self-start">
          <CardHeader>
            <CardTitle className="text-base">当前品牌</CardTitle>
            <CardDescription>AI 会参考品牌档案、记忆和已选素材。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground">品牌名称</p>
              <p className="mt-1 font-medium">{brandName ?? "未填写品牌名称"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">品牌语调</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {brandTone || "未填写，默认使用清爽、可信、克制的表达。"}
              </p>
            </div>
            <Separator />
            <div>
              <p className="text-xs text-muted-foreground">当前工作区</p>
              <p className="mt-1 font-medium">{workspaceName}</p>
            </div>
            <div className="rounded-md bg-muted/50 p-3 text-xs leading-5 text-muted-foreground">
              输入越像真实任务，云雀越能像社媒运营同事一样给出可直接编辑的草稿。
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                和云雀说你想创作什么
              </CardTitle>
              <CardDescription>
                可以直接描述平台、产品、素材用途和想要的风格；高级设置先不用管。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleGenerate}>
                <Textarea
                  className="min-h-36 resize-y text-base leading-7"
                  value={creativeBrief}
                  onChange={(event) => setCreativeBrief(event.target.value)}
                  placeholder="例如：用这几张产品图生成一篇 Instagram 新品发布文案；帮我写一条适合 TikTok 的短视频脚本；根据这个产品资料生成小红书种草文案。"
                  disabled={isGenerating}
                />

                <div className="rounded-md border bg-muted/20 p-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">已选择素材</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        不选素材也可以生成；添加素材后内容会更贴合产品。
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setAssetDialogOpen(true)}
                      >
                        <FileImage className="size-4" />
                        选择素材
                      </Button>
                      <Button type="button" variant="outline" size="sm" asChild>
                        <Link href="/assets">
                          <UploadCloud className="size-4" />
                          去素材库上传
                        </Link>
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedAssetDetails.length > 0 ? (
                      selectedAssetDetails.map((asset) => (
                        <button
                          key={asset.id}
                          type="button"
                          className="inline-flex max-w-full items-center gap-2 rounded-md border bg-background px-2 py-1 text-xs hover:bg-muted"
                          onClick={() => toggleAsset(asset.id)}
                          title="点击移除"
                        >
                          <span className="truncate">{getAssetName(asset)}</span>
                          <span className="text-muted-foreground">移除</span>
                        </button>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        当前未选择素材，云雀会先基于品牌档案和品牌记忆生成通用草稿。
                      </span>
                    )}
                  </div>
                </div>

                <div className="rounded-md border">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                    onClick={() => setAdvancedOpen((current) => !current)}
                  >
                    <span className="inline-flex items-center gap-2 text-sm font-medium">
                      <SlidersHorizontal className="size-4 text-primary" />
                      高级设置
                    </span>
                    <ChevronDown
                      className={`size-4 text-muted-foreground transition-transform ${
                        advancedOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {advancedOpen ? (
                    <div className="space-y-4 border-t p-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="space-y-2 text-sm font-medium">
                          平台
                          <select
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                            value={platformChoice}
                            onChange={(event) =>
                              handlePlatformChoiceChange(event.target.value)
                            }
                            disabled={isGenerating}
                          >
                            <option value="AUTO">AI 自动推荐 / 通用</option>
                            {platformOptions.map((platform) => (
                              <option key={platform} value={platform}>
                                {platformLabels[platform]}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="space-y-2 text-sm font-medium">
                          内容类型
                          <select
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                            value={form.contentType}
                            onChange={(event) =>
                              updateForm(
                                "contentType",
                                event.target.value as ContentType,
                              )
                            }
                            disabled={isGenerating}
                          >
                            {contentTypeOptions.map((contentType) => (
                              <option key={contentType} value={contentType}>
                                {contentTypeLabels[contentType]}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="space-y-2 text-sm font-medium">
                          输出语言
                          <select
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                            value={form.outputLanguage}
                            onChange={(event) =>
                              updateForm(
                                "outputLanguage",
                                event.target.value as ContentOutputLanguage,
                              )
                            }
                            disabled={isGenerating}
                          >
                            {outputLanguageOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="space-y-2 text-sm font-medium md:col-span-2">
                          营销目标
                          <Input
                            value={form.marketingGoal}
                            onChange={(event) =>
                              updateForm("marketingGoal", event.target.value)
                            }
                            placeholder="可选，例如：新品首发、提升转化、引导收藏、解释卖点。"
                            disabled={isGenerating}
                          />
                        </label>

                        <label className="space-y-2 text-sm font-medium">
                          语气
                          <Input
                            value={form.tone}
                            onChange={(event) =>
                              updateForm("tone", event.target.value)
                            }
                            placeholder="例如：专业、轻松、可信、有画面感"
                            disabled={isGenerating}
                          />
                        </label>

                        <label className="space-y-2 text-sm font-medium">
                          生成数量
                          <Input
                            min={1}
                            max={5}
                            type="number"
                            value={form.numberOfVariants}
                            onChange={(event) =>
                              updateForm(
                                "numberOfVariants",
                                Number(event.target.value),
                              )
                            }
                            disabled={isGenerating}
                          />
                        </label>

                        <label className="space-y-2 text-sm font-medium md:col-span-2">
                          额外要求
                          <Textarea
                            className="min-h-24"
                            value={form.extraInstructions}
                            onChange={(event) =>
                              updateForm("extraInstructions", event.target.value)
                            }
                            placeholder="例如：避免夸大功效；标题更像真实分享；CTA 不要太硬。"
                            disabled={isGenerating}
                          />
                        </label>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">
                    {platformChoice === "AUTO"
                      ? "平台未固定，云雀会根据你的需求判断更适合的表达方式。"
                      : `将按 ${platformLabels[platformChoice]} 风格生成。`}
                  </p>
                  <Button disabled={isGenerating} type="submit" size="lg">
                    {isGenerating ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        正在生成...
                      </>
                    ) : (
                      <>
                        <Sparkles className="size-4" />
                        生成内容
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <CardTitle>生成结果</CardTitle>
                  <CardDescription>
                    每条结果都可以复制、编辑、保存，保存后可加入内容日历。
                  </CardDescription>
                </div>
                {savedIndexes.length > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => router.push("/calendar")}
                  >
                    <CalendarDays className="size-4" />
                    去日历
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {variants.length > 0 ? (
                variants.map((variant, index) => {
                  const isSaved = savedIndexes.includes(index);
                  const savedContentId = savedContentIds[index];
                  const riskLevel = variant.complianceCheck?.riskLevel;

                  return (
                    <div
                      key={`${variant.title}-${index}`}
                      className={`rounded-md border bg-background p-4 ${
                        riskLevel === "high"
                          ? "border-destructive/40 bg-destructive/5"
                          : ""
                      }`}
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="outline">
                              {lastPlatformChoice === "AUTO"
                                ? `AI 推荐 · ${generationPlatformLabel}`
                                : generationPlatformLabel}
                            </Badge>
                            <Badge variant="secondary">
                              {contentTypeLabels[
                                lastGenerationForm?.contentType ?? form.contentType
                              ]}
                            </Badge>
                            <Badge variant="outline">
                              {
                                outputLanguageLabels[
                                  lastGenerationForm?.outputLanguage ??
                                    form.outputLanguage
                                ]
                              }
                            </Badge>
                            <Badge
                              variant={getRiskBadgeVariant(riskLevel)}
                              className={
                                riskLevel === "high"
                                  ? "bg-destructive text-destructive-foreground"
                                  : ""
                              }
                            >
                              {getRiskLabel(riskLevel)}
                            </Badge>
                            {isSaved ? <Badge>已保存</Badge> : null}
                          </div>
                          <h2 className="mt-3 text-lg font-semibold leading-7">
                            {variant.title}
                          </h2>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopyVariant(variant)}
                          >
                            <Copy className="size-4" />
                            复制
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openVariantEdit(variant, index)}
                          >
                            <Pencil className="size-4" />
                            编辑
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={savingIndex === index || isSaved}
                            onClick={() => handleSave(variant, index)}
                          >
                            {savingIndex === index ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Save className="size-4" />
                            )}
                            {isSaved ? "已保存" : "保存"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={!savedContentId}
                            onClick={() => openGeneratedVariantCalendar(variant, index)}
                            title={savedContentId ? "加入内容日历" : "先保存后加入日历"}
                          >
                            <CalendarDays className="size-4" />
                            加入日历
                          </Button>
                        </div>
                      </div>

                      {riskLevel === "high" ? (
                        <div className="mt-4 flex gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                          <div>
                            <p className="font-medium">高风险内容，请谨慎使用</p>
                            <p className="mt-1 leading-6">
                              建议先按合规提示改写，再进入发布计划。
                            </p>
                          </div>
                        </div>
                      ) : null}

                      <Separator className="my-4" />

                      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
                        <div className="space-y-4">
                          <div>
                            <p className="text-sm font-medium">开头钩子</p>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">
                              {variant.hook}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm font-medium">正文</p>
                            <p className="mt-2 whitespace-pre-line text-sm leading-7 text-muted-foreground">
                              {variant.body}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm font-medium">CTA</p>
                            <p className="mt-2 text-sm text-muted-foreground">
                              {variant.cta}
                            </p>
                          </div>
                        </div>

                        <div className="rounded-md bg-muted/35 p-4">
                          <p className="text-sm font-medium">标签</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {variant.hashtags.map((tag) => (
                              <Badge key={tag} variant="outline">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                          <Separator className="my-4" />
                          <p className="text-sm font-medium">素材建议</p>
                          <p className="mt-2 text-sm leading-6 text-muted-foreground">
                            {variant.visualSuggestion}
                          </p>
                          <Separator className="my-4" />
                          <p className="text-sm font-medium">风险提示</p>
                          {variant.complianceCheck ? (
                            <div className="mt-2 space-y-2">
                              <p className="text-sm leading-6 text-muted-foreground">
                                {variant.complianceCheck.overallSuggestion}
                              </p>
                              {riskLevel === "high" &&
                              variant.complianceCheck.issues.length > 0 ? (
                                <p className="text-xs leading-5 text-muted-foreground">
                                  主要问题：
                                  {variant.complianceCheck.issues[0]?.reason}
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            <p className="mt-2 text-sm text-muted-foreground">
                              暂无合规检查结果。
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-md border border-dashed bg-muted/30 p-10 text-center">
                  <Sparkles className="mx-auto mb-3 size-8 text-muted-foreground" />
                  <p className="text-sm font-medium">
                    输入需求后，云雀会在这里给出内容草稿。
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    你可以先不选平台和素材，直接让 AI 判断方向。
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>最近生成内容</CardTitle>
          <CardDescription>
            已保存内容会以 DRAFT 状态进入内容库；这里仅保留轻量管理入口。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentContents.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {recentContents.map((content) => {
                const riskLevel = content.riskNotes?.riskLevel;
                const isActing = actionContentId === content.id;

                return (
                  <div key={content.id} className="rounded-md border p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          {content.platforms.map((platform) => (
                            <Badge key={platform} variant="outline">
                              {platformLabels[platform]}
                            </Badge>
                          ))}
                          <Badge variant="secondary">
                            {contentTypeLabels[content.type]}
                          </Badge>
                          <Badge variant="outline">
                            {contentStatusLabels[content.status]}
                          </Badge>
                          <Badge
                            variant={getRiskBadgeVariant(riskLevel)}
                            className={
                              riskLevel === "high"
                                ? "bg-destructive text-destructive-foreground"
                                : ""
                            }
                          >
                            {getRiskLabel(riskLevel)}
                          </Badge>
                        </div>
                        <p className="truncate font-medium">{content.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatDateTime(new Date(content.createdAt))}
                          {" · "}
                          {content.assets.length > 0
                            ? `${content.assets.length} 个素材`
                            : "未关联素材"}
                        </p>
                      </div>
                      <div className="flex shrink-0 justify-end gap-1.5">
                        <Button
                          size="icon"
                          variant="outline"
                          title="查看详情"
                          onClick={() => setDetailsContent(content)}
                        >
                          <Eye className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="outline"
                          title="复制正文"
                          onClick={() => handleCopy(content)}
                        >
                          <Copy className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="outline"
                          title="编辑"
                          onClick={() => openEdit(content)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="outline"
                          title="加入内容日历"
                          onClick={() => openCalendar(content)}
                        >
                          <CalendarDays className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="outline"
                          title="删除"
                          disabled={isActing}
                          onClick={() => handleDeleteContent(content)}
                        >
                          {isActing ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-md border border-dashed bg-muted/30 p-8 text-center">
              <p className="text-sm font-medium">
                保存生成结果后，它会出现在这里。
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                最近内容不会打断主创作流程，可用于快速复制、编辑或加入日历。
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={assetDialogOpen} onOpenChange={setAssetDialogOpen}>
        <DialogContent className="max-h-[86vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>选择素材</DialogTitle>
            <DialogDescription>
              最多选择 12 个素材。素材不是必填，但会让生成内容更具体。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {assets.length > 0 ? (
              assets.map((asset) => {
                const selected = form.selectedAssets.includes(asset.id);

                return (
                  <button
                    key={asset.id}
                    type="button"
                    className={`flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors ${
                      selected ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                    }`}
                    onClick={() => toggleAsset(asset.id)}
                  >
                    <span
                      className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border text-xs ${
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "bg-background"
                      }`}
                    >
                      {selected ? "✓" : ""}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {getAssetName(asset)}
                      </span>
                      <span className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {getAssetHint(asset)}
                      </span>
                      {asset.tags.length > 0 ? (
                        <span className="mt-2 flex flex-wrap gap-1.5">
                          {asset.tags.slice(0, 5).map((tag) => (
                            <Badge key={tag} variant="outline">
                              {tag}
                            </Badge>
                          ))}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="rounded-md border border-dashed p-8 text-center">
                <p className="text-sm font-medium">素材库暂无可用素材</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  可以先直接生成，也可以去素材库上传产品图、视频或资料。
                </p>
                <Button className="mt-4" asChild>
                  <Link href="/assets">
                    <UploadCloud className="size-4" />
                    去素材库上传
                  </Link>
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => updateForm("selectedAssets", [])}
              disabled={form.selectedAssets.length === 0}
            >
              清空
            </Button>
            <Button type="button" onClick={() => setAssetDialogOpen(false)}>
              <CheckCircle2 className="size-4" />
              完成选择
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(detailsContent)}
        onOpenChange={() => setDetailsContent(null)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          {detailsContent ? (
            <>
              <DialogHeader>
                <DialogTitle>{detailsContent.title}</DialogTitle>
                <DialogDescription>
                  {detailsContent.platforms
                    .map((platform) => platformLabels[platform])
                    .join("，")}
                  {" · "}
                  {contentTypeLabels[detailsContent.type]}
                  {" · "}
                  {contentStatusLabels[detailsContent.status]}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge
                    variant={getRiskBadgeVariant(
                      detailsContent.riskNotes?.riskLevel,
                    )}
                  >
                    {getRiskLabel(detailsContent.riskNotes?.riskLevel)}
                  </Badge>
                  {detailsContent.hashtags.map((tag) => (
                    <Badge key={tag} variant="outline">
                      {tag}
                    </Badge>
                  ))}
                </div>
                <div className="rounded-md border bg-muted/30 p-4">
                  <p className="whitespace-pre-line text-sm leading-7">
                    {detailsContent.body}
                  </p>
                </div>
                {detailsContent.callToAction ? (
                  <div>
                    <p className="text-sm font-medium">CTA</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {detailsContent.callToAction}
                    </p>
                  </div>
                ) : null}
                <div>
                  <p className="text-sm font-medium">关联素材</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {detailsContent.assets.length > 0 ? (
                      detailsContent.assets.map((asset) => (
                        <Badge key={asset.id} variant="secondary">
                          {asset.fileName ?? asset.title}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        暂无关联素材
                      </span>
                    )}
                  </div>
                </div>
                {detailsContent.riskNotes ? (
                  <div>
                    <p className="text-sm font-medium">风险说明</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {detailsContent.riskNotes.overallSuggestion}
                    </p>
                    {detailsContent.riskNotes.issues.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {detailsContent.riskNotes.issues.map((issue, index) => (
                          <div
                            key={`${issue.text}-${index}`}
                            className="rounded-md border p-3"
                          >
                            <p className="text-sm font-medium">{issue.text}</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {issue.reason}
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              建议：{issue.suggestion}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={editingVariantIndex !== null}
        onOpenChange={() => setEditingVariantIndex(null)}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>编辑生成结果</DialogTitle>
            <DialogDescription>
              这里只修改当前页面的草稿，点击保存后才会写入内容库。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="space-y-2 text-sm font-medium">
              标题
              <Input
                value={variantEditTitle}
                onChange={(event) => setVariantEditTitle(event.target.value)}
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              正文
              <Textarea
                className="min-h-60"
                value={variantEditBody}
                onChange={(event) => setVariantEditBody(event.target.value)}
              />
            </label>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingVariantIndex(null)}
            >
              取消
            </Button>
            <Button onClick={handleUpdateVariant}>
              <Save className="size-4" />
              更新草稿
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editingContent)}
        onOpenChange={() => setEditingContent(null)}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>编辑内容</DialogTitle>
            <DialogDescription>可修改标题和正文，状态与风险记录暂不变。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="space-y-2 text-sm font-medium">
              标题
              <Input
                value={editTitle}
                onChange={(event) => setEditTitle(event.target.value)}
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              正文
              <Textarea
                className="min-h-60"
                value={editBody}
                onChange={(event) => setEditBody(event.target.value)}
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingContent(null)}>
              取消
            </Button>
            <Button
              disabled={Boolean(
                editingContent && actionContentId === editingContent.id,
              )}
              onClick={handleUpdateContent}
            >
              {editingContent && actionContentId === editingContent.id ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              保存修改
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(calendarContent)}
        onOpenChange={() => setCalendarContent(null)}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>加入内容日历</DialogTitle>
            <DialogDescription>
              创建一个 ContentCalendarItem，状态默认为已排期。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="space-y-2 text-sm font-medium">
              排期时间
              <Input
                type="datetime-local"
                value={calendarScheduledAt}
                onChange={(event) => setCalendarScheduledAt(event.target.value)}
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              负责人
              <Input
                value={calendarOwnerName}
                onChange={(event) => setCalendarOwnerName(event.target.value)}
                placeholder="例如：Mia"
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              备注
              <Textarea
                value={calendarNotes}
                onChange={(event) => setCalendarNotes(event.target.value)}
                placeholder="例如：发布前复核封面和禁用词。"
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCalendarContent(null)}>
              取消
            </Button>
            <Button
              disabled={Boolean(
                calendarContent && actionContentId === calendarContent.id,
              )}
              onClick={handleAddToCalendar}
            >
              {calendarContent && actionContentId === calendarContent.id ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CalendarDays className="size-4" />
              )}
              加入日历
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
