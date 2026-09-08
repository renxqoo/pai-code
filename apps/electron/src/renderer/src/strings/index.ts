/**
 * 用户可见文案单一真相：双表（zh 默认 / en）+ locale 切换。
 * 组件一律 `copy.x.y` 取值（每次属性访问按当前 locale 解析，切换后下次渲染生效）；
 * 运行时切换经 setLocale（localStorage 持久化，key 结构由 en 表定型、zh 表编译期对齐）。
 */
import { en } from './en';
import { zh } from './zh';

export type Locale = 'zh' | 'en';
export type StringTables = typeof en;

const STORAGE_KEY = 'pai-locale';

function initialLocale(): Locale {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'zh';
  } catch {
    return 'zh';
  }
}

let locale: Locale = initialLocale();
const tables: Record<Locale, StringTables> = { zh, en };

export function setLocale(next: Locale): void {
  locale = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // 存储不可用时仅本次运行内生效
  }
}

export function getLocale(): Locale {
  return locale;
}

/** 切换语言并广播（app 根监听后按 locale 重挂载工作区，穿透 memo 树）。 */
export function changeLocale(next: Locale): void {
  setLocale(next);
  window.dispatchEvent(new Event('pai-locale'));
}

export const copy: StringTables = new Proxy({} as StringTables, {
  get(_target, section) {
    return (tables[locale] as unknown as Record<string, unknown>)[section as string];
  },
});
