/**
 * bridge 本地存储（T57 §5）：令牌与主机地址的移动端持久面。
 * 一期 AsyncStorage 等价实现（react-native 无 localStorage；expo-secure-store
 * 是后续升级位——令牌敏感性注释钉住）。
 */
const TOKEN_KEY = 'pai.mobile.bridge.token';
const HOST_KEY = 'pai.mobile.bridge.host';

/** 存储注入（测试内存实现；生产 react-native）。 */
export interface BridgeStorageDriver {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** RN 异步存储同步包装（ AsyncStorage 的同步面不存在——用模块级缓存 + 启动加载）。
 *  生产实现：AppState 变化/退出时 flush。一期用内存 + 单例（冷启动后首次
 *  devices 页手动连接；后续任务替换为真异步存储——接口已隔离）。 */
class MemoryDriver implements BridgeStorageDriver {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

let driver: BridgeStorageDriver = new MemoryDriver();

export function setBridgeStorageDriver(next: BridgeStorageDriver): void {
  driver = next;
}

export const bridgeStorage = {
  loadToken(): string | null {
    return driver.getItem(TOKEN_KEY);
  },
  saveToken(token: string): void {
    driver.setItem(TOKEN_KEY, token);
  },
  loadHost(): string {
    return driver.getItem(HOST_KEY) ?? '';
  },
  saveHost(host: string): void {
    driver.setItem(HOST_KEY, host);
  },
  clear(): void {
    driver.removeItem(TOKEN_KEY);
    driver.removeItem(HOST_KEY);
  },
};
