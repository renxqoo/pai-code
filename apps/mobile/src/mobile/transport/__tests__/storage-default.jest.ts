import { describe, expect, it } from '@jest/globals';

// 默认驱动（MemoryDriver）的行为面：本文件不注入 setDriver——直接用模块缺省实例
import { bridgeStorage } from '../bridge-storage';

describe('bridge-storage 默认驱动', () => {
  it('round-trip：token/host 读写删', () => {
    bridgeStorage.clear();
    expect(bridgeStorage.loadToken()).toBeNull();
    expect(bridgeStorage.loadHost()).toBe('');
    bridgeStorage.saveToken('tok-default');
    bridgeStorage.saveHost('host-default');
    expect(bridgeStorage.loadToken()).toBe('tok-default');
    expect(bridgeStorage.loadHost()).toBe('host-default');
    bridgeStorage.clear();
    expect(bridgeStorage.loadToken()).toBeNull();
  });
});
