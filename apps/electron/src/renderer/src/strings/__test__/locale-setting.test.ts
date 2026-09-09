import { describe, expect, test } from 'bun:test';

import {
  DEFAULT_LOCALE_SETTING,
  changeLocaleSetting,
  getLocale,
  getLocaleSetting,
  parseLocaleSetting,
  resolveLocale,
  resolveSystemLocale,
} from '../index';

describe('语言设置解析', () => {
  test('存储值解析：合法三值原样，非法/缺失降级默认（跟随系统）', () => {
    expect(parseLocaleSetting('zh')).toBe('zh');
    expect(parseLocaleSetting('en')).toBe('en');
    expect(parseLocaleSetting('system')).toBe('system');
    expect(parseLocaleSetting(null)).toBe(DEFAULT_LOCALE_SETTING);
    expect(parseLocaleSetting('fr')).toBe(DEFAULT_LOCALE_SETTING);
    expect(parseLocaleSetting('')).toBe(DEFAULT_LOCALE_SETTING);
  });

  test('系统语言标签组：任一 zh 开头即中文，否则英文', () => {
    expect(resolveSystemLocale(['zh-CN'])).toBe('zh');
    expect(resolveSystemLocale(['en-US', 'zh-Hans-CN'])).toBe('zh');
    expect(resolveSystemLocale(['en-US'])).toBe('en');
    expect(resolveSystemLocale([])).toBe('en');
  });

  test('语言设置 → Locale：跟随系统按标签解析，无标签降级中文', () => {
    expect(resolveLocale('zh', ['en-US'])).toBe('zh');
    expect(resolveLocale('en', ['zh-CN'])).toBe('en');
    expect(resolveLocale('system', ['zh-CN', 'en-US'])).toBe('zh');
    expect(resolveLocale('system', ['en-US'])).toBe('en');
    expect(resolveLocale('system', [])).toBe('zh');
  });

  test('模块初始态可读取且自洽（无 window 环境降级中文）', () => {
    expect(['zh', 'en']).toContain(getLocale());
    expect(['system', 'zh', 'en']).toContain(getLocaleSetting());
    // bun test 无 window/localStorage：跟随系统无标签 → zh
    if (getLocaleSetting() === 'system') expect(getLocale()).toBe('zh');
  });

  test('changeLocaleSetting：写存储 + 广播 pai-locale + 解析面联动（最小 window 装置）', () => {
    const events: string[] = [];
    const storage = new Map<string, string>();
    const scope = globalThis as { window?: unknown };
    const previousWindow = scope.window;
    scope.window = {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => void storage.set(key, value),
      },
      navigator: { languages: ['zh-CN'], language: 'zh-CN' },
      dispatchEvent: (event: { type: string }) => {
        events.push(event.type);
        return true;
      },
    };
    try {
      changeLocaleSetting('en');
      expect(storage.get('pai-locale')).toBe('en');
      expect(events).toEqual(['pai-locale']);
      expect(getLocaleSetting()).toBe('en');
      expect(getLocale()).toBe('en');
      changeLocaleSetting('system');
      expect(storage.get('pai-locale')).toBe('system');
      expect(events).toEqual(['pai-locale', 'pai-locale']);
      expect(getLocaleSetting()).toBe('system');
      // 系统标签 zh-CN → 解析回 zh
      expect(getLocale()).toBe('zh');
    } finally {
      // 先把模块态拨回默认（此时 window 装置仍在），再摘装置，不污染同文件其它用例
      changeLocaleSetting(DEFAULT_LOCALE_SETTING);
      if (previousWindow === undefined) delete scope.window;
      else scope.window = previousWindow;
    }
  });
});
