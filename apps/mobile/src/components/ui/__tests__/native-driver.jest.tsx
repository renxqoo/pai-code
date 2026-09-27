import { describe, expect, it } from '@jest/globals';
import { nativeDriverFor } from '@/components/ui/native-driver';

describe('Animated 驱动选择（平台坑）', () => {
  it('web 强制 JS 驱动（症状：web 端 loading 转一圈卡死成静态图标——loop 续跑分支只看 useNativeDriver 标记、不看实际驱动能力）', () => {
    expect(nativeDriverFor('web')).toBe(false);
    expect(nativeDriverFor('ios')).toBe(true);
    expect(nativeDriverFor('android')).toBe(true);
  });
});
