"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Bot,
  FileText,
  Loader2,
  Megaphone,
  Save,
  Sparkles,
} from "lucide-react";
import { useForm } from "react-hook-form";
import {
  BrandMemoryManager,
  type BrandMemoryItem,
} from "@/components/brand-profile/brand-memory-manager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast-provider";
import { getApiErrorMessage, parseApiPayload } from "@/lib/client-api";
import {
  brandProfileFormSchema,
  type BrandProfileFormValues,
} from "@/lib/validators/brand-profile";

export type BrandProfileAnalysisView = {
  brandSummary: string | null;
  targetAudienceSummary: string | null;
  toneOfVoice: string[];
  contentAngles: string[];
  forbiddenClaims: string[];
  recommendedPlatforms: string[];
  marketingSuggestions: string[];
  aiAnalysisUpdatedAt: string | null;
};

type BrandProfileQuestionnaireProps = {
  workspaceName: string;
  initialValues: BrandProfileFormValues;
  initialAnalysis: BrandProfileAnalysisView | null;
  initialMemories: BrandMemoryItem[];
  hasSavedProfile: boolean;
};

type NoticeState = {
  type: "success" | "error";
  message: string;
} | null;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

function SaveBar({
  isDirty,
  isSubmitting,
  isAnalyzing,
}: {
  isDirty: boolean;
  isSubmitting: boolean;
  isAnalyzing: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
      <Badge variant={isDirty ? "accent" : "secondary"} className="w-fit">
        {isDirty ? "有未保存修改" : "已同步"}
      </Badge>
      <Button type="submit" disabled={isSubmitting || isAnalyzing}>
        {isSubmitting ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Save className="size-4" />
        )}
        保存品牌档案
      </Button>
    </div>
  );
}

function AnalysisList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border bg-background p-4">
      <p className="text-sm font-medium">{title}</p>
      {items.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {items.map((item) => (
            <Badge key={item} variant="outline" className="max-w-full break-words">
              {item}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">暂无结果</p>
      )}
    </div>
  );
}

function AnalysisPanel({
  analysis,
  canAnalyze,
  isAnalyzing,
  isSubmitting,
  isDirty,
  onAnalyze,
}: {
  analysis: BrandProfileAnalysisView | null;
  canAnalyze: boolean;
  isAnalyzing: boolean;
  isSubmitting: boolean;
  isDirty: boolean;
  onAnalyze: () => void;
}) {
  const disabled = isSubmitting || isAnalyzing || !canAnalyze || isDirty;
  const title = !canAnalyze
    ? "请先保存基础信息"
    : isDirty
      ? "请先保存当前修改"
      : "AI 分析品牌";

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bot className="size-4 text-primary" />
              AI 品牌画像
            </CardTitle>
            <CardDescription>
              基于已保存的品牌档案生成总结、内容方向和风险表达。
            </CardDescription>
          </div>
          <div className="flex flex-col items-start gap-2 lg:items-end">
            {analysis?.aiAnalysisUpdatedAt ? (
              <Badge variant="secondary">
                更新于 {new Date(analysis.aiAnalysisUpdatedAt).toLocaleString("zh-CN")}
              </Badge>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={onAnalyze}
              title={title}
            >
              {isAnalyzing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              AI 分析品牌
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {!analysis ? (
          <div className="rounded-md border border-dashed bg-muted/30 p-8 text-center">
            <p className="text-sm font-medium">当前还没有 AI 品牌画像</p>
            <p className="mt-2 text-sm text-muted-foreground">
              保存基础信息后，可以生成品牌总结、内容方向和平台建议。
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-md border bg-background p-4">
              <p className="text-sm font-medium">AI 总结</p>
              <p className="mt-3 break-words text-sm leading-7 text-muted-foreground">
                {analysis.brandSummary || "暂无结果"}
              </p>
              {analysis.targetAudienceSummary ? (
                <p className="mt-3 break-words text-sm leading-7 text-muted-foreground">
                  {analysis.targetAudienceSummary}
                </p>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <AnalysisList title="内容方向" items={analysis.contentAngles} />
              <AnalysisList title="推荐平台" items={analysis.recommendedPlatforms} />
              <AnalysisList title="营销建议" items={analysis.marketingSuggestions} />
              <AnalysisList title="风险表达" items={analysis.forbiddenClaims} />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function composeToneValue({
  brandTone,
  commonExpressions,
  copyLengthPreference,
  emojiPreference,
}: {
  brandTone?: string;
  commonExpressions: string;
  copyLengthPreference: string;
  emojiPreference: string;
}) {
  return [
    brandTone?.trim(),
    commonExpressions.trim()
      ? `常用表达：${commonExpressions.trim()}`
      : "",
    copyLengthPreference.trim()
      ? `文案长度偏好：${copyLengthPreference.trim()}`
      : "",
    emojiPreference.trim()
      ? `Emoji 使用偏好：${emojiPreference.trim()}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function BrandProfileQuestionnaire({
  workspaceName,
  initialValues,
  initialAnalysis,
  initialMemories,
  hasSavedProfile,
}: BrandProfileQuestionnaireProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [notice, setNotice] = useState<NoticeState>(null);
  const [analysis, setAnalysis] = useState<BrandProfileAnalysisView | null>(
    initialAnalysis,
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [canAnalyze, setCanAnalyze] = useState(hasSavedProfile);
  const [commonExpressions, setCommonExpressions] = useState("");
  const [copyLengthPreference, setCopyLengthPreference] = useState("");
  const [emojiPreference, setEmojiPreference] = useState("");
  const form = useForm<BrandProfileFormValues>({
    resolver: zodResolver(brandProfileFormSchema),
    defaultValues: initialValues,
  });
  const {
    formState: { errors, isSubmitting, isDirty },
    register,
  } = form;

  async function onSubmit(values: BrandProfileFormValues) {
    setNotice(null);
    const submitValues: BrandProfileFormValues = {
      ...values,
      brandTone: composeToneValue({
        brandTone: values.brandTone,
        commonExpressions,
        copyLengthPreference,
        emojiPreference,
      }),
    };

    try {
      const response = await fetch("/api/brand-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submitValues),
      });
      const payload = await parseApiPayload(response);

      if (!response.ok) {
        const message = getApiErrorMessage(payload, "保存失败，请稍后再试。");
        setNotice({ type: "error", message });
        showToast({ type: "error", title: "保存失败", description: message });
        return;
      }

      const message =
        typeof payload.message === "string" ? payload.message : "品牌档案已保存。";
      setNotice({ type: "success", message });
      setCanAnalyze(true);
      setCommonExpressions("");
      setCopyLengthPreference("");
      setEmojiPreference("");
      showToast({ type: "success", title: "保存成功", description: message });
      form.reset(submitValues);
      router.refresh();
    } catch {
      const message = "网络暂时不可用，品牌档案保存失败。";
      setNotice({ type: "error", message });
      showToast({ type: "error", title: "保存失败", description: message });
    }
  }

  async function handleAnalyze() {
    if (!canAnalyze || isDirty) {
      const message = "请先保存基础信息，再进行 AI 分析。";
      setNotice({ type: "error", message });
      showToast({ type: "error", title: "暂不能分析", description: message });
      return;
    }

    setNotice(null);
    setIsAnalyzing(true);

    try {
      const response = await fetch("/api/brand-profile/analyze", {
        method: "POST",
      });
      const payload = await parseApiPayload(response);

      if (!response.ok) {
        const message = getApiErrorMessage(payload, "AI 分析失败，请稍后再试。");
        setNotice({ type: "error", message });
        showToast({ type: "error", title: "AI 分析失败", description: message });
        return;
      }

      setAnalysis(payload.analysis);
      const message =
        typeof payload.message === "string" ? payload.message : "AI 品牌分析已完成。";
      setNotice({ type: "success", message });
      showToast({ type: "success", title: "AI 分析完成", description: message });
      router.refresh();
    } catch {
      const message = "网络暂时不可用，AI 分析失败。";
      setNotice({ type: "error", message });
      showToast({ type: "error", title: "AI 分析失败", description: message });
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <div className="space-y-4">
      {notice ? (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            notice.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          {notice.message}
        </div>
      ) : null}

      <Tabs defaultValue="basic" className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="basic">基础信息</TabsTrigger>
          <TabsTrigger value="tone">品牌语调</TabsTrigger>
          <TabsTrigger value="analysis">AI 品牌画像</TabsTrigger>
          <TabsTrigger value="memory">品牌记忆</TabsTrigger>
        </TabsList>

        <form onSubmit={form.handleSubmit(onSubmit)}>
          <TabsContent value="basic" className="mt-0">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="size-4 text-primary" />
                  基础信息
                </CardTitle>
                <CardDescription>
                  当前品牌空间：{workspaceName}。这些信息会作为 AI 生成内容的基础上下文。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 text-sm font-medium">
                    品牌名称
                    <Input
                      placeholder="例如：青柠生活馆"
                      {...register("brandName")}
                    />
                    <FieldError message={errors.brandName?.message} />
                  </label>

                  <label className="space-y-2 text-sm font-medium">
                    行业
                    <Input
                      placeholder="例如：饮品、电商、独立站"
                      {...register("industry")}
                    />
                    <FieldError message={errors.industry?.message} />
                  </label>

                  <label className="space-y-2 text-sm font-medium">
                    官网
                    <Input
                      placeholder="https://example.com"
                      {...register("websiteUrl")}
                    />
                    <FieldError message={errors.websiteUrl?.message} />
                  </label>

                  <label className="space-y-2 text-sm font-medium">
                    店铺链接
                    <Input
                      placeholder="https://store.example.com"
                      {...register("storeUrl")}
                    />
                    <FieldError message={errors.storeUrl?.message} />
                  </label>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <label className="space-y-2 text-sm font-medium">
                    主营产品
                    <Textarea
                      className="min-h-32"
                      placeholder="描述产品品类、核心卖点、价格带、使用场景等。"
                      {...register("productDescription")}
                    />
                    <FieldError message={errors.productDescription?.message} />
                  </label>

                  <label className="space-y-2 text-sm font-medium">
                    目标用户
                    <Textarea
                      className="min-h-32"
                      placeholder="描述人群画像、消费动机、常见痛点和内容偏好。"
                      {...register("targetAudience")}
                    />
                    <FieldError message={errors.targetAudience?.message} />
                  </label>
                </div>

                <SaveBar
                  isDirty={isDirty}
                  isSubmitting={isSubmitting}
                  isAnalyzing={isAnalyzing}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tone" className="mt-0">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Megaphone className="size-4 text-primary" />
                  品牌语调
                </CardTitle>
                <CardDescription>
                  把品牌关键词、表达偏好和禁用表达沉淀成 AI 可遵守的写作规则。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 lg:grid-cols-2">
                  <label className="space-y-2 text-sm font-medium">
                    品牌关键词
                    <Textarea
                      className="min-h-28"
                      placeholder="例如：低糖，通勤，东方茶感，轻负担"
                      {...register("brandKeywords")}
                    />
                    <FieldError message={errors.brandKeywords?.message} />
                  </label>

                  <label className="space-y-2 text-sm font-medium">
                    品牌语气
                    <Textarea
                      className="min-h-28"
                      placeholder="例如：可信、清爽、克制，像朋友分享真实体验。"
                      {...register("brandTone")}
                    />
                    <FieldError message={errors.brandTone?.message} />
                  </label>

                  <label className="space-y-2 text-sm font-medium">
                    常用表达
                    <Textarea
                      className="min-h-24"
                      value={commonExpressions}
                      onChange={(event) => setCommonExpressions(event.target.value)}
                      placeholder="例如：真实体验、轻负担、日常好物、适合通勤。"
                    />
                  </label>

                  <label className="space-y-2 text-sm font-medium">
                    禁用表达
                    <Textarea
                      className="min-h-24"
                      placeholder="例如：100% 有效，全网第一，治愈，永久有效。"
                      {...register("forbiddenWords")}
                    />
                    <FieldError message={errors.forbiddenWords?.message} />
                  </label>

                  <label className="space-y-2 text-sm font-medium">
                    文案长度偏好
                    <Input
                      value={copyLengthPreference}
                      onChange={(event) =>
                        setCopyLengthPreference(event.target.value)
                      }
                      placeholder="例如：小红书 300-600 字，广告文案保持短句。"
                    />
                  </label>

                  <label className="space-y-2 text-sm font-medium">
                    emoji 使用偏好
                    <Select value={emojiPreference} onValueChange={setEmojiPreference}>
                      <SelectTrigger>
                        <SelectValue placeholder="选择 emoji 使用偏好" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="不使用 emoji">不使用 emoji</SelectItem>
                        <SelectItem value="少量使用 emoji">少量使用 emoji</SelectItem>
                        <SelectItem value="根据平台适度使用 emoji">
                          根据平台适度使用 emoji
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                </div>

                <label className="space-y-2 text-sm font-medium">
                  竞品链接
                  <Textarea
                    className="min-h-24"
                    placeholder="多个链接可用逗号或换行分隔。"
                    {...register("competitorLinks")}
                  />
                  <FieldError message={errors.competitorLinks?.message} />
                </label>

                <SaveBar
                  isDirty={isDirty}
                  isSubmitting={isSubmitting}
                  isAnalyzing={isAnalyzing}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analysis" className="mt-0">
            <AnalysisPanel
              analysis={analysis}
              canAnalyze={canAnalyze}
              isAnalyzing={isAnalyzing}
              isSubmitting={isSubmitting}
              isDirty={isDirty}
              onAnalyze={handleAnalyze}
            />
          </TabsContent>
        </form>

        <TabsContent value="memory" className="mt-0">
          <BrandMemoryManager initialMemories={initialMemories} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
