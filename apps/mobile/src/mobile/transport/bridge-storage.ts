/**
 * bridge 本地存储（T57 §5）：令牌（敏感——expo-secure-store）与主机地址
 * （async-storage）的移动端持久面。驱动异步初始化 + 模块缓存同步读：
 * App 启动时 preloadBridgeStorage() 一次，之后 loadToken/loadHost 同步返回。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'pai.mobile.bridge.token';
const HOST_KEY = 'pai.mobile.bridge.host';

/** 同步缓存面（既有消费者零改动；测试注入用）。 */
export interface BridgeStorageDriver {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** 持久驱动初始化（App 启动调用一次；失败降级内存——连接不崩，仅不持久）。 */
export async function preloadBridgeStorage(): Promise<void> {
  try {
    const [token, host] = await Promise.all([
      SecureStore.getItemAsync(TOKEN_KEY),
      AsyncStorage.getItem(HOST_KEY),
    ]);
    if (token !== null) cache.setItem(TOKEN_KEY, token);
    if (host !== null) cache.setItem(HOST_KEY, host);
  } catch {
    // 存储不可用：内存态照常工作（本会话内有效）
  }
}

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

/** 异步落盘面（save* 先写缓存再后台持久——读路径永不等待）。 */
const persist = (key: string, value: string | null): void => {
  if (key === TOKEN_KEY) {
    void (value === null ? SecureStore.deleteItemAsync(TOKEN_KEY) : SecureStore.setItemAsync(TOKEN_KEY, value)).catch(() => undefined);
  } else {
    void (value === null ? AsyncStorage.removeItem(HOST_KEY) : AsyncStorage.setItem(HOST_KEY, value)).catch(() => undefined);
  }
};

const cache = {
  getItem(key: string): string | null {
    return driver.getItem(key);
  },
  setItem(key: string, value: string): void {
    driver.setItem(key, value);
    persist(key, value);
  },
  removeItem(key: string): void {
    driver.removeItem(key);
    persist(key, null);
  },
};

export const bridgeStorage = {
  loadToken(): string | null {
    return cache.getItem(TOKEN_KEY);
  },
  saveToken(token: string): void {
    cache.setItem(TOKEN_KEY, token);
  },
  loadHost(): string {
    return cache.getItem(HOST_KEY) ?? '';
  },
  saveHost(host: string): void {
    cache.setItem(HOST_KEY, host);
  },
  clear(): void {
    cache.removeItem(TOKEN_KEY);
    cache.removeItem(HOST_KEY);
  },
};
