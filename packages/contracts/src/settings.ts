import { z } from "zod";

/**
 * 应用设置（主进程 settings.json 的形状）。
 * provider 的 apiKey 只存主进程（safeStorage 加密落盘），任何 API 响应不回传。
 */

/** 自定义模型条目：id + pi 能力声明（reasoning=false 的模型思考档只有 Off；vision=false 时 pi 按纯文本模型剥图）。 */
export const ProviderModelSchema = z
  .object({
    id: z.string().min(1),
    /** pi models.json 的模型级 reasoning 能力（决定思考档位可选）。 */
    reasoning: z.boolean(),
    /** pi models.json 的模型级 input 模态（true → ["text","image"]；自建多模态模型必须声明，否则发送时图片被剥成占位文本）。 */
    vision: z.boolean().default(false),
    /** pi models.json 的模型级 contextWindow（compaction 触发阈值；缺省回落 pi 默认 128000）。 */
    contextWindow: z.number().int().positive().optional(),
    /** pi models.json 的模型级 maxTokens（单次输出上限；缺省回落 pi 默认 16384）。 */
    maxTokens: z.number().int().positive().optional(),
  })
  .strict();
export type ProviderModel = z.infer<typeof ProviderModelSchema>;

/**
 * 思考参数形态（镜像 pi models.json 的 compat.thinkingFormat 值域子集——
 * 可在表单安全暴露的形态；chat-template 系需要额外 kwargs 配置，不进 UI）。
 * 'default' = 不写 compat（OpenAI 风格 reasoning_effort 直发）。
 */
export const ThinkingFormatSchema = z.enum([
  "default",
  "zai",
  "qwen",
  "deepseek",
  "openrouter",
  "together",
  "string-thinking",
  "ant-ling",
]);
export type ThinkingFormat = z.infer<typeof ThinkingFormatSchema>;

/**
 * UI 可安全暴露的 API 格式子集（镜像 pi 的 KnownApi 中无需额外鉴权/私有协议的格式）。
 * 其余格式（azure/vertex/bedrock/codex/pi-messages）只能手写 models.json，不进选择器。
 */
export const ApiFormatSchema = z.enum([
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
  "google-generative-ai",
  "mistral-conversations",
]);
export type ApiFormat = z.infer<typeof ApiFormatSchema>;

/** 词表顺序即 UI 选项顺序（文案由 strings 提供）。 */
export const API_FORMAT_IDS: readonly ApiFormat[] = ApiFormatSchema.options;

/** 词表判定：UI 选择器据此决定「回退显示原值」还是「按词表展示」。 */
export function isApiFormat(value: string): value is ApiFormat {
  return (API_FORMAT_IDS as readonly string[]).includes(value);
}

export const ProviderConfigSchema = z
  .object({
    /** models.json 的 provider 键名。 */
    name: z.string().min(1),
    baseUrl: z.string().min(1),
    /**
     * pi models.json 的 api 字段。持久化面保持宽松：磁盘上手写的非词表格式
     * （如 pi-messages）不得因 UI 词表收窄被判非法而整表降级丢配置。
     */
    api: z.string().min(1),
    models: z.array(ProviderModelSchema).min(1),
    /** 思考参数形态；default = 不写 compat。 */
    thinkingFormat: ThinkingFormatSchema.default("default"),
  })
  .strict();
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

/** 闲置自动回收档位（分钟）；词表顺序即 UI 选项顺序。 */
export const IDLE_RECYCLE_MINUTE_OPTIONS = [3, 5, 10, 15] as const;
export type IdleRecycleMinutes = (typeof IDLE_RECYCLE_MINUTE_OPTIONS)[number];
export const IdleRecycleMinutesSchema = z.union([z.literal(3), z.literal(5), z.literal(10), z.literal(15)]);

export const SettingsSchema = z
  .object({
    /** 宿主注入点：bun 与 pai-cli 入口；null = 装配层缺省（打包产物路径）。 */
    hubDev: z
      .object({ bunPath: z.string().nullable(), hubEntry: z.string().nullable() })
      .default({ bunPath: null, hubEntry: null }),
    providers: z.array(ProviderConfigSchema).default([]),
    /** thread/start 的 trusted 缺省（项目扩展加载策略的全局默认）。 */
    trustedDefault: z.boolean().default(false),
    /** 新会话预选模型（"provider/modelId"）；null = 未设置（回落首个可用模型）。 */
    defaultModel: z.string().nullable().default(null),
    /** 首次引导完成标志（跳过也算完成；与 provider 配置解耦）。 */
    onboarded: z.boolean().default(false),
    /** 每项目默认模型记忆（cwd → "provider/modelId"；切换模型时写入）。 */
    projectModels: z.record(z.string(), z.string()).default({}),
    /** 置顶的历史会话文件（sessionPath 集合的数组形态）。 */
    pinnedSessions: z.array(z.string()).default([]),
    /** 已归档的历史会话文件（sessionPath 键）：侧栏与历史列表默认隐藏，设置页可恢复。 */
    archivedSessions: z.array(z.string()).default([]),
    /** 侧栏已移除（隐藏）的项目目录（cwd）；同目录新建任务即解除。 */
    hiddenProjects: z.array(z.string()).default([]),
    /** worker 闲置自动回收时长（分钟；v0.13——spawn env PAI_IDLE_RETIRE_MS 注入 + 运行期 set_idle_retire_ms 同步）。 */
    idleRecycleMinutes: IdleRecycleMinutesSchema.default(5),
  })
  .strict();

export type Settings = z.infer<typeof SettingsSchema>;

/**
 * settings.json 宽容读取：磁盘旧形态（models 为 string[]）就地升级为模型条目，
 * 无法解析的整体降级默认值（垃圾输入不清空磁盘文件，仅本次运行用缺省）。
 */
export function parseSettings(raw: unknown): Settings {
  const migrated = migrateProviders(raw);
  try {
    return SettingsSchema.parse(migrated);
  } catch {
    return SettingsSchema.parse({});
  }
}

function migrateProviders(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return raw;
  const providers = (raw as { providers?: unknown }).providers;
  if (!Array.isArray(providers)) return raw;
  return {
    ...(raw as Record<string, unknown>),
    providers: providers.map((provider) => {
      if (typeof provider !== "object" || provider === null || Array.isArray(provider))
        return provider;
      const models = (provider as { models?: unknown }).models;
      if (!Array.isArray(models)) return provider;
      return {
        ...(provider as Record<string, unknown>),
        models: models.map((model) =>
          typeof model === "string" ? { id: model, reasoning: false } : model,
        ),
      };
    }),
  };
}
