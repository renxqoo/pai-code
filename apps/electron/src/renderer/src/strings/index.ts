/**
 * 用户可见文案单一真相：双表（zh 默认 / en）+ locale 切换。
 * 组件一律 `copy.x.y` 取值（每次属性访问按当前 locale 解析，切换后下次渲染生效）。
 * 语言设置面（LocaleSetting）支持「跟随系统」：存储层存 setting，解析层得到 Locale；
 * 运行时切换经 changeLocaleSetting（localStorage 持久化，key 结构由 en 表定型、zh 表编译期对齐）。
 */
import { en } from './en';
import { zh } from './zh';

/** 解析面：copy 表的键。 */
export type Locale = 'zh' | 'en';
/** 存储面：设置界面可选项（含跟随系统）。 */
export type LocaleSetting = 'system' | 'zh' | 'en';
export type StringTables = typeof en;

const STORAGE_KEY = 'pai-locale';
/** 未存储时的默认语言设置（跟随系统）。 */
export const DEFAULT_LOCALE_SETTING: LocaleSetting = 'system';

/** 存储值 → 语言设置（非法/缺失值降级默认）。 */
export function parseLocaleSetting(stored: string | null): LocaleSetting {
  return stored === 'zh' || stored === 'en' || stored === 'system' ? stored : DEFAULT_LOCALE_SETTING;
}

/** 系统语言标签组 → Locale（任一 zh 开头即中文，否则英文）。 */
export function resolveSystemLocale(tags: readonly string[]): Locale {
  return tags.some((tag) => tag.toLowerCase().startsWith('zh')) ? 'zh' : 'en';
}

function readStoredSetting(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // 存储不可用时仅本次运行内生效
    return null;
  }
}

function systemTags(): readonly string[] {
  try {
    const { navigator } = window;
    return navigator.languages.length > 0 ? [...navigator.languages] : [navigator.language];
  } catch {
    return [];
  }
}

/** 语言设置 → 解析 Locale（跟随系统时按系统语言解析；无系统信息降级中文）。 */
export function resolveLocale(setting: LocaleSetting, tags: readonly string[]): Locale {
  return setting === 'system' ? (tags.length > 0 ? resolveSystemLocale(tags) : 'zh') : setting;
}

let localeSetting: LocaleSetting = parseLocaleSetting(readStoredSetting());
let locale: Locale = resolveLocale(localeSetting, systemTags());
const tables: Record<Locale, StringTables> = { zh, en };

function applyLocaleSetting(next: LocaleSetting): void {
  localeSetting = next;
  locale = resolveLocale(next, systemTags());
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // 存储不可用时仅本次运行内生效
  }
}

export function getLocale(): Locale {
  return locale;
}

export function getLocaleSetting(): LocaleSetting {
  return localeSetting;
}

/** 切换语言设置并广播（app 根监听后按 locale 重挂载工作区，穿透 memo 树）。 */
export function changeLocaleSetting(next: LocaleSetting): void {
  applyLocaleSetting(next);
  window.dispatchEvent(new Event('pai-locale'));
}

export const copy: StringTables = new Proxy({} as StringTables, {
  get(_target, section) {
    return (tables[locale] as unknown as Record<string, unknown>)[section as string];
  },
});
