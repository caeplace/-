import OpenAI from "openai";
import type { ResponseInputMessageContentList } from "openai/resources/responses/responses";
import {
  defaultDeepSeekBaseURL,
  getAiProvider as resolveAiProvider,
  getAiProviderLabel as resolveAiProviderLabel,
  getAiProviderModel,
  isAiProviderConfigured,
  type AiProvider,
} from "@/lib/ai/provider";
import {
  buildBrandProfilePrompt,
  type BrandProfileAnalysis,
  type BrandProfilePromptInput,
} from "@/lib/prompts/brand-profile";
import {
  buildAssetAnalysisPrompt,
  type AssetAnalysis,
  type AssetAnalysisPromptInput,
} from "@/lib/prompts/asset-analysis";
import {
  buildContentGenerationPrompt,
  getPrimaryCreativeRequest,
  type ContentGenerationPromptInput,
  type GeneratedContentVariant,
} from "@/lib/prompts/content-generation";
import {
  buildComplianceCheckPrompt,
  type ComplianceCheckPromptInput,
  type ComplianceCheckResult,
  type RiskLevel,
} from "@/lib/prompts/compliance-check";
import {
  buildInsightsPrompt,
  type InsightsPromptInput,
  type InsightsResult,
} from "@/lib/prompts/insights";
import {
  buildReplyAssistantPrompt,
  replyScenarioLabels,
  type ReplyAssistantPromptInput,
  type ReplySuggestion,
} from "@/lib/prompts/reply-assistant";
import type { AiPrompt, GenerateJsonResult } from "@/types/ai";

type GenerateJsonOptions<T> = {
  prompt: AiPrompt;
  fallback: T;
  model?: string;
};

const globalForAI = globalThis as unknown as {
  openai?: OpenAI;
  deepseek?: OpenAI;
};

export function getAiProvider(): AiProvider {
  return resolveAiProvider();
}

export function getAiProviderLabel() {
  return resolveAiProviderLabel();
}

export function isAiConfigured() {
  return isAiProviderConfigured();
}

export function getConfiguredAiModel(model?: string) {
  if (model) return model;
  return getAiProviderModel();
}

export function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  if (!globalForAI.openai) {
    globalForAI.openai = new OpenAI({ apiKey });
  }

  return globalForAI.openai;
}

export function getDeepSeekClient() {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not configured.");
  }

  if (!globalForAI.deepseek) {
    globalForAI.deepseek = new OpenAI({
      apiKey,
      baseURL: process.env.DEEPSEEK_BASE_URL || defaultDeepSeekBaseURL,
    });
  }

  return globalForAI.deepseek;
}

function stripCodeFence(value: string) {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractJsonCandidate(value: string, preferArray = false) {
  const clean = stripCodeFence(value);
  if (clean.startsWith("{") && clean.endsWith("}")) return clean;
  if (clean.startsWith("[") && clean.endsWith("]")) return clean;

  if (preferArray) {
    const arrayStart = clean.indexOf("[");
    const arrayEnd = clean.lastIndexOf("]");

    if (arrayStart >= 0 && arrayEnd > arrayStart) {
      return clean.slice(arrayStart, arrayEnd + 1);
    }
  }

  const objectStart = clean.indexOf("{");
  const objectEnd = clean.lastIndexOf("}");

  if (objectStart >= 0 && objectEnd > objectStart) {
    return clean.slice(objectStart, objectEnd + 1);
  }

  const arrayStart = clean.indexOf("[");
  const arrayEnd = clean.lastIndexOf("]");

  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    return clean.slice(arrayStart, arrayEnd + 1);
  }

  return clean;
}

export function parseJsonWithFallback<T>(
  raw: string,
  fallback: T,
): GenerateJsonResult<T> {
  try {
    const parsed = JSON.parse(
      extractJsonCandidate(raw, Array.isArray(fallback)),
    ) as T;

    if (Array.isArray(fallback) !== Array.isArray(parsed)) {
      throw new Error("JSON root type does not match the expected shape.");
    }

    return {
      data: parsed,
      raw,
      parsed: true,
    };
  } catch (error) {
    return {
      data: fallback,
      raw,
      parsed: false,
      error: error instanceof Error ? error.message : "JSON parse failed.",
    };
  }
}

async function generateOpenAIJson<T>({
  prompt,
  fallback,
  model,
}: GenerateJsonOptions<T>): Promise<GenerateJsonResult<T>> {
  const client = getOpenAIClient();
  const response = await client.responses.create({
    model: getConfiguredAiModel(model),
    instructions: prompt.system,
    input: prompt.user,
    text: prompt.jsonSchema
      ? {
          format: {
            type: "json_schema",
            name: prompt.jsonSchema.name,
            description: prompt.jsonSchema.description,
            schema: prompt.jsonSchema.schema,
            strict: prompt.jsonSchema.strict ?? true,
          },
        }
      : {
          format: {
            type: "json_object",
          },
        },
  });

  return parseJsonWithFallback(response.output_text ?? "", fallback);
}

async function generateDeepSeekJson<T>({
  prompt,
  fallback,
  model,
}: GenerateJsonOptions<T>): Promise<GenerateJsonResult<T>> {
  const client = getDeepSeekClient();
  const schemaType = prompt.jsonSchema?.schema.type;
  const response = await client.chat.completions.create({
    model: getConfiguredAiModel(model),
    messages: [
      {
        role: "system",
        content: prompt.system,
      },
      {
        role: "user",
        content: prompt.user,
      },
    ],
    response_format: schemaType === "array" ? undefined : { type: "json_object" },
  });
  const raw = response.choices[0]?.message?.content ?? "";

  return parseJsonWithFallback(raw, fallback);
}

function generateMockJson<T>(fallback: T): GenerateJsonResult<T> {
  return {
    data: fallback,
    raw: JSON.stringify(fallback),
    parsed: true,
  };
}

export async function generateJson<T>(
  options: GenerateJsonOptions<T>,
): Promise<GenerateJsonResult<T>> {
  const provider = getAiProvider();

  if (provider === "mock") return generateMockJson(options.fallback);
  if (provider === "deepseek") return generateDeepSeekJson(options);

  return generateOpenAIJson(options);
}

export function createBrandProfileAnalysisFallback(
  input: BrandProfilePromptInput,
): BrandProfileAnalysis {
  const brandName = input.brandName || "未命名品牌";

  return {
    brandSummary:
      input.productDescription || `${brandName} 的品牌问卷已保存，但 AI 分析暂不可用。`,
    targetAudienceSummary: input.targetAudience || "暂无足够目标用户信息。",
    toneOfVoice: input.brandTone
      ? input.brandTone
          .split(/[,，\n]/)
          .map((item) => item.trim())
          .filter(Boolean)
      : input.brandKeywords.slice(0, 4),
    contentAngles: input.brandKeywords.map((keyword) => `围绕「${keyword}」展开内容主题`),
    forbiddenClaims: input.forbiddenWords.map((word) => `避免使用「${word}」相关表达`),
    recommendedPlatforms:
      input.platformPreferences.length > 0
        ? input.platformPreferences
        : ["小红书", "Instagram", "TikTok"],
    marketingSuggestions: [
      "补充更具体的产品卖点、目标用户痛点和平台运营目标。",
      "将高频品牌关键词沉淀为内容选题模板。",
      "生成内容前先检查禁用词和夸大表达。",
    ],
  };
}

export async function generateBrandProfileAnalysis(
  input: BrandProfilePromptInput,
) {
  return generateJson<BrandProfileAnalysis>({
    prompt: buildBrandProfilePrompt(input),
    fallback: createBrandProfileAnalysisFallback(input),
  });
}

function compactStringList(values: Array<string | null | undefined>) {
  return values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
}

export function createAssetAnalysisFallback(
  input: AssetAnalysisPromptInput,
): AssetAnalysis {
  const baseTags = compactStringList([
    ...input.tags,
    input.assetType,
    input.fileType,
    input.scene,
    input.productName,
  ]);
  const tags = [...new Set(baseTags)].slice(0, 8);
  const productName = input.productName || "未明确";
  const scene = input.scene || input.batchName || "未明确";
  const suggestedUse =
    input.suggestedUse ||
    (input.assetType === "IMAGE"
      ? "可用于素材库归档、社媒配图或内容生成参考。"
      : "可作为内容生成、卖点提炼或运营资料整理的参考素材。");

  return {
    aiDescription:
      input.description ||
      `素材「${input.fileName}」已完成基础分析。当前无法直接读取完整文件内容，已基于文件名、说明和 metadata 生成初步描述。`,
    tags: tags.length > 0 ? tags : ["素材", "待分析", "品牌资产"],
    productName,
    scene,
    visualStyle: input.hasImageInput ? "图片视觉风格待进一步确认" : "非视觉素材",
    suggestedUse,
    recommendedPlatforms:
      input.recommendedPlatforms.length > 0
        ? input.recommendedPlatforms
        : ["小红书", "Instagram", "TikTok"],
  };
}

export async function generateAssetAnalysis({
  input,
  imageDataUrl,
}: {
  input: AssetAnalysisPromptInput;
  imageDataUrl?: string | null;
}) {
  const provider = getAiProvider();

  if (provider === "mock") {
    const fallback = createAssetAnalysisFallback(input);
    return generateMockJson(fallback);
  }

  if (provider === "deepseek") {
    const promptInput = imageDataUrl
      ? {
          ...input,
          hasImageInput: false,
          textContent: [
            input.textContent,
            "当前 DeepSeek 接入使用文本模型，图片文件本身未发送；请基于文件名、说明、标签、批次信息和 metadata 做基础分析。",
          ]
            .filter(Boolean)
            .join("\n"),
        }
      : input;

    return generateJson<AssetAnalysis>({
      prompt: buildAssetAnalysisPrompt(promptInput),
      fallback: createAssetAnalysisFallback(promptInput),
    });
  }

  const prompt = buildAssetAnalysisPrompt(input);
  const content: ResponseInputMessageContentList = [
    {
      type: "input_text",
      text: prompt.user,
    },
  ];

  if (imageDataUrl) {
    content.push({
      type: "input_image",
      image_url: imageDataUrl,
      detail: "auto",
    });
  }

  const client = getOpenAIClient();
  const response = await client.responses.create({
    model: getConfiguredAiModel(),
    instructions: prompt.system,
    input: [
      {
        role: "user",
        content,
      },
    ],
    text: prompt.jsonSchema
      ? {
          format: {
            type: "json_schema",
            name: prompt.jsonSchema.name,
            description: prompt.jsonSchema.description,
            schema: prompt.jsonSchema.schema,
            strict: prompt.jsonSchema.strict ?? true,
          },
        }
      : {
          format: {
            type: "json_object",
          },
        },
  });

  return parseJsonWithFallback<AssetAnalysis>(
    response.output_text ?? "",
    createAssetAnalysisFallback(input),
  );
}

function getFallbackCopyProfile(productName: string) {
  const normalized = productName.toLowerCase();

  if (/沙发|家具|sofa|furniture|leather/.test(normalized)) {
    return {
      zhScene: "客厅、会客区或午后放松的角落",
      zhSensory: "细腻触感、稳重轮廓和耐看的线条",
      zhBenefit: "让空间多一点沉稳、舒适和不过度张扬的高级感",
      enScene: "the living room, a hosting corner, or a quiet afternoon at home",
      enSensory: "refined texture, a grounded silhouette, and timeless lines",
      enBenefit:
        "adds comfort, calm, and understated quality to the whole space",
    };
  }

  if (/苹果|果汁|juice|apple|drink|饮品|饮料/.test(normalized)) {
    return {
      zhScene: "早餐、通勤路上或午后补充状态的片刻",
      zhSensory: "清爽果香、明亮口感和轻负担的日常感",
      zhBenefit: "让简单的一口也变得更有精神、更容易被记住",
      enScene: "breakfast, a commute, or a quick afternoon refresh",
      enSensory: "bright fruit notes, a clean taste, and an easy everyday feel",
      enBenefit: "turns a small sip into a refreshing moment people remember",
    };
  }

  return {
    zhScene: "真实的日常使用场景",
    zhSensory: "清晰卖点、细节质感和直观体验",
    zhBenefit: "让用户更快理解它为什么值得选择",
    enScene: "a real everyday use case",
    enSensory: "clear selling points, thoughtful details, and a tangible feel",
    enBenefit: "helps people quickly understand why it is worth choosing",
  };
}

export function createContentGenerationFallback(
  input: ContentGenerationPromptInput,
): GeneratedContentVariant[] {
  const assetNames = input.selectedAssets
    .map((asset) => asset.fileName || asset.productName)
    .filter(Boolean);
  const primaryRequest =
    getPrimaryCreativeRequest(input.marketingGoal) || "提升品牌内容表现";
  const productName =
    input.selectedAssets.find((asset) => asset.productName)?.productName ||
    primaryRequest;
  const englishWithChinese = input.outputLanguage === "EN_WITH_ZH";
  const platformEnglishLabels: Record<string, string> = {
    INSTAGRAM: "Instagram",
    TIKTOK: "TikTok",
    FACEBOOK: "Facebook",
    PINTEREST: "Pinterest",
    LINKEDIN: "LinkedIn",
    XIAOHONGSHU: "Xiaohongshu",
  };
  const contentTypeEnglishLabels: Record<string, string> = {
    POST: "single-image post",
    CAROUSEL: "carousel post",
    SHORT_VIDEO_SCRIPT: "short-form video script",
    STORY: "story",
    AD_COPY: "ad copy",
  };
  const englishPlatformLabel =
    platformEnglishLabels[input.platform] ?? input.platformLabel;
  const englishContentTypeLabel =
    contentTypeEnglishLabels[input.contentType] ?? input.contentTypeLabel;
  const copyProfile = getFallbackCopyProfile(productName);

  return Array.from({ length: Math.max(1, input.numberOfVariants) }, (_, index) => {
    const variantNumber = index + 1;
    const zhTitle =
      variantNumber % 2 === 0
        ? `${productName}，把质感放进日常`
        : `${productName}，一眼感受到高级质感`;
    const zhHook =
      variantNumber % 2 === 0
        ? `真正耐看的品质，往往藏在日常细节里。`
        : `好的${productName}，不需要用力证明自己。`;
    const zhBody = [
      `${productName}适合出现在${copyProfile.zhScene}。`,
      `它给人的直观感受，是${copyProfile.zhSensory}。不是夸张地抢镜，而是让人靠近之后愿意多看一眼、多停留一会儿。`,
      `如果你想要的是${copyProfile.zhBenefit}，这会是一个很自然的选择。`,
      assetNames.length > 0
        ? `发布时可以结合这组素材展示细节：${assetNames.slice(0, 3).join("、")}。`
        : `发布时建议补充一张清晰的场景图或细节图，让卖点更直观。`,
    ].join("\n\n");
    const zhCta = `想让${productName}更贴近日常场景，可以先收藏这条灵感，发布前再配上真实素材。`;

    if (englishWithChinese) {
      const englishBody = [
        `${productName} fits naturally into ${copyProfile.enScene}.`,
        `The first thing people notice is ${copyProfile.enSensory}. It does not need to shout; it simply makes the moment feel more considered.`,
        `For anyone looking for something that ${copyProfile.enBenefit}, this is an easy detail to remember.`,
        assetNames.length > 0
          ? `Reference assets: ${assetNames.slice(0, 3).join(", ")}.`
          : "Before publishing, pair this copy with a clean product detail or lifestyle image.",
      ]
        .filter(Boolean)
        .join("\n\n");

      return {
        title: `${productName}: quiet quality for everyday moments / ${zhTitle}`,
        hook: `Good ${productName} does not need to prove itself loudly.\n中文对照：${zhHook}`,
        body: `${englishBody}\n\n中文对照：\n${zhBody}`,
        hashtags: [
          productName,
          "brand content",
          "product story",
          englishPlatformLabel,
        ].filter(Boolean),
        cta: `Save this idea and pair it with real product visuals before publishing.\n中文对照：${zhCta}`,
        visualSuggestion:
          `Use a clean visual that clearly shows ${productName}, its details, or a believable usage scene.\n中文对照：优先选择清晰展示${productName}外观、细节或使用场景的素材。`,
        platformNotes:
          `${englishPlatformLabel} content should match the browsing rhythm of a ${englishContentTypeLabel}; check the first-screen hook, title clarity, and CTA before publishing.\n中文对照：${input.platformLabel} 内容需要适配 ${input.contentTypeLabel} 的浏览节奏，发布前检查标题、首屏信息和行动号召。`,
      };
    }

    return {
      title: zhTitle,
      hook: zhHook,
      body: zhBody,
      hashtags: [productName, "品牌内容", "新品灵感", input.platformLabel].filter(
        Boolean,
      ),
      cta: zhCta,
      visualSuggestion:
        input.selectedAssets[0]?.suggestedUse ||
        `优先选择清晰展示${productName}外观、细节或使用场景的素材作为首图/开场镜头。`,
      platformNotes: `${input.platformLabel} 内容需要适配 ${input.contentTypeLabel} 的浏览节奏，发布前检查标题、首屏信息和行动号召。`,
    };
  });
}

export async function generateContentVariants(input: ContentGenerationPromptInput) {
  return generateJson<GeneratedContentVariant[]>({
    prompt: buildContentGenerationPrompt(input),
    fallback: createContentGenerationFallback(input),
  });
}

export function createInsightsFallback(input: InsightsPromptInput): InsightsResult {
  const topPlatform = input.metrics.topPlatform ?? "暂无明确平台";
  const commonType = input.metrics.mostCommonContentType ?? "暂无明确类型";
  const brandName = input.brandProfile?.brandName ?? input.workspaceName;

  return {
    monthlySummary: `${input.monthLabel}，${brandName} 生成 ${input.metrics.generatedContentCount} 条内容，已排期 ${input.metrics.plannedPublishCount} 条，已发布 ${input.metrics.publishedCount} 条。`,
    assetSuggestions:
      input.metrics.unusedAssetCount > 0
        ? [
            `当前还有 ${input.metrics.unusedAssetCount} 个未使用素材，优先挑 3 个生成内容。`,
            "为新品图、场景图补齐标签，方便下次生成时快速选择。",
          ]
        : [
            "未使用素材较少，建议继续上传新品图、场景图和卖点文档。",
          ],
    contentSuggestions: [
      input.metrics.generatedContentCount > 0
        ? `复盘本月 ${input.metrics.generatedContentCount} 条内容，把可复用标题写入品牌记忆。`
        : "本月内容较少，先围绕 3 个核心卖点生成内容。",
      input.metrics.unplannedContentCount > 0
        ? `还有 ${input.metrics.unplannedContentCount} 条内容未加入日历，先完成排期。`
        : "已保存内容基本都有排期，重点维护发布状态。",
    ],
    platformSuggestions: [
      input.metrics.topPlatform
        ? `当前内容集中在 ${topPlatform}，下周可补 1 个其他平台版本。`
        : "平台分布还不明确，先选择 1-2 个主平台持续发布。",
      `常见内容类型是 ${commonType}，可补充短视频脚本或轮播版本。`,
    ],
    riskSuggestions:
      input.metrics.highRiskContentCount > 0
        ? [
            `本月有 ${input.metrics.highRiskContentCount} 条高风险内容，发布前先人工复核。`,
            "把反复出现的风险表达写入合规类品牌记忆。",
          ]
        : [
            "本月暂无高风险内容，发布前继续检查禁用词和夸大承诺。",
          ],
    nextMonthPlan: [
      "下周先选 3 个素材，生成 3 条短内容并加入日历。",
      "每周沉淀 1 条品牌记忆，让后续生成更贴近品牌。",
      input.metrics.unplannedContentCount > 0
        ? "先处理未排期内容，再补充新内容。"
        : "优先消化未使用素材，再扩展新主题。",
    ],
  };
}

export async function generateInsights(input: InsightsPromptInput) {
  return generateJson<InsightsResult>({
    prompt: buildInsightsPrompt(input),
    fallback: createInsightsFallback(input),
  });
}

export function createReplySuggestionFallback(
  input: ReplyAssistantPromptInput,
): ReplySuggestion {
  const cautious =
    input.scenario === "NEGATIVE_COMMENT" ||
    input.scenario === "SENSITIVE" ||
    input.scenario === "AFTER_SALES";
  const scenarioLabel = replyScenarioLabels[input.scenario];
  const memoryHint = input.brandMemories
    .slice()
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 2)
    .map((memory) => memory.content)
    .join("；");

  const suggestedReply = cautious
    ? `你好，感谢你愿意把这个情况告诉我们。我们会认真核实，也理解你的顾虑。为了更准确地帮你处理，方便的话请补充相关订单信息、购买渠道或具体使用场景。我们会基于实际情况给你进一步回复。`
    : `你好，感谢你的留言。关于你的问题，我们建议先结合具体使用场景来判断；如果你方便补充更多信息，我们可以给你更准确的建议。`;

  return {
    suggestedReply,
    tone: cautious ? "克制、理解、谨慎、愿意协助" : "友好、清晰、专业、自然",
    riskNotes: cautious
      ? "当前场景需要避免争辩、绝对化承诺、退款赔付承诺、功效保证或无法核实的事实判断。"
      : "回复前仍建议检查是否包含禁用词、夸大承诺或超出品牌实际能力的表述。",
    alternativeReplies: [
      `${suggestedReply} ${memoryHint ? `同时我们会参考品牌规则：${memoryHint}` : ""}`.trim(),
      `收到你的信息了，我们先帮你记录这个问题。为了避免误判，想再确认一下具体情况：${input.customerMessage.slice(0, 80)}`,
      scenarioLabel === "合作咨询"
        ? "你好，感谢关注我们的品牌。可以请你补充合作形式、账号/渠道信息和预期内容方向吗？我们会评估是否适合进一步沟通。"
        : "谢谢你的反馈，我们会认真看待。你可以把更多细节发给我们，我们会尽量给到清晰、稳妥的回复。",
    ],
  };
}

export async function generateReplySuggestion(input: ReplyAssistantPromptInput) {
  return generateJson<ReplySuggestion>({
    prompt: buildReplyAssistantPrompt(input),
    fallback: createReplySuggestionFallback(input),
  });
}

const absolutePromisePatterns = [
  "100% effective",
  "guaranteed",
  "best",
  "cure",
  "risk-free",
  "100%",
  "保证",
  "最佳",
  "治愈",
  "根治",
  "零风险",
  "无风险",
  "永久有效",
  "全网第一",
];

const sensitiveExpressionPatterns = [
  "医疗",
  "金融",
  "健康",
  "减肥",
  "保健品",
  "瘦身",
  "降糖",
  "治疗",
  "疗效",
  "投资",
  "收益",
  "medical",
  "finance",
  "health",
  "weight loss",
  "supplement",
];

function joinComplianceContent(input: ComplianceCheckPromptInput) {
  return [
    input.content.title,
    input.content.hook,
    input.content.body,
    input.content.cta,
    input.content.hashtags.join(" "),
    input.content.visualSuggestion,
    input.content.platformNotes,
  ]
    .filter(Boolean)
    .join("\n");
}

function findCaseInsensitive(source: string, keyword: string) {
  return source.toLowerCase().includes(keyword.toLowerCase());
}

function inferRiskLevel(issueReasons: string[]): RiskLevel {
  if (
    issueReasons.some(
      (reason) =>
        reason.includes("禁用词") ||
        reason.includes("敏感") ||
        reason.includes("绝对化"),
    )
  ) {
    return "high";
  }

  if (issueReasons.length > 0) return "medium";
  return "low";
}

export function createComplianceCheckFallback(
  input: ComplianceCheckPromptInput,
): ComplianceCheckResult {
  const content = joinComplianceContent(input);
  const issues: ComplianceCheckResult["issues"] = [];

  for (const keyword of absolutePromisePatterns) {
    if (findCaseInsensitive(content, keyword)) {
      issues.push({
        text: keyword,
        reason: "包含绝对化承诺或难以证实的强承诺表达。",
        suggestion: "改为更谨慎的体验式表达，例如「有助于」「适合」「可以尝试」。",
      });
    }
  }

  for (const keyword of sensitiveExpressionPatterns) {
    if (findCaseInsensitive(content, keyword)) {
      issues.push({
        text: keyword,
        reason: "涉及医疗、金融、健康、减肥或保健品等敏感表达。",
        suggestion: "避免功效承诺，改为描述产品特征、使用场景或用户体验。",
      });
    }
  }

  for (const keyword of [...input.forbiddenWords, ...input.forbiddenClaims]) {
    if (keyword && findCaseInsensitive(content, keyword)) {
      issues.push({
        text: keyword,
        reason: "命中 BrandProfile 中的禁用词或不建议使用的营销表达。",
        suggestion: "删除该表达，改为更克制、可验证的品牌语言。",
      });
    }
  }

  const riskLevel = inferRiskLevel(issues.map((issue) => issue.reason));

  return {
    riskLevel,
    issues: issues.slice(0, 12),
    overallSuggestion:
      riskLevel === "low"
        ? "未发现明显合规风险。发布前仍建议结合平台规则和品牌禁用词复核。"
        : riskLevel === "medium"
          ? "存在可调整的表达风险，建议按替代表达修改后再发布。"
          : "存在高风险表达，建议谨慎使用并优先改写相关内容。",
  };
}

export async function generateComplianceCheck(input: ComplianceCheckPromptInput) {
  return generateJson<ComplianceCheckResult>({
    prompt: buildComplianceCheckPrompt(input),
    fallback: createComplianceCheckFallback(input),
  });
}
