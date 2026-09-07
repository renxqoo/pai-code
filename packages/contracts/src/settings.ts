import { z } from 'zod';

/**
 * 应用设置（主进程 settings.json 的形状）。
 * provider 的 apiKey 只存主进程（safeStorage 加密落盘），任何 API 响应不回传。
 */
export const ProviderConfigSchema = z
  .object({
    /** models.json 的 provider 键名。 */
    name: z.string().min(1),
    baseUrl: z.string().min(1),
    /** pai-cli models.json 的 api 字段（如 openai-completions）。 */
    api: z.string().min(1),
    models: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export const SettingsSchema = z
  .object({
    /** 宿主注入点：bun 与 pai-cli 入口；null = 装配层缺省（打包产物路径）。 */
    hubDev: z
      .object({ bunPath: z.string().nullable(), hubEntry: z.string().nullable() })
      .default({ bunPath: null, hubEntry: null }),
    providers: z.array(ProviderConfigSchema).default([]),
    /** thread/start 的 trusted 缺省（项目扩展加载策略的全局默认）。 */
    trustedDefault: z.boolean().default(false),
  })
  .strict();

export type Settings = z.infer<typeof SettingsSchema>;
