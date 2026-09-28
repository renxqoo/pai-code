/**
 * relay 凭证与持久化（T58）：配对产物（设备身份/sharedSecret）走 SecureStore、
 * ratchet 边界走同步 KV（MMKV 形态——注入式；测试内存实现）。异步预载 + 同步读。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { RatchetBoundaryStore } from './ratchet-codec';

/** 安全存储面：原生走 SecureStore；web 形态降级 AsyncStorage（浏览器本地隔离——
 *  relay 凭证非明文密码形态，web 降级为一期可接受面，真机仍 SecureStore）。 */
const secureGet = async (key: string): Promise<string | null> => {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return AsyncStorage.getItem(key);
  }
};
const secureSet = async (key: string, value: string): Promise<void> => {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    await AsyncStorage.setItem(key, value);
  }
};
const secureDelete = async (key: string): Promise<void> => {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    await AsyncStorage.removeItem(key);
  }
};

const KEY_DEVICE = 'pai.relay.device';
const KEY_SHARED = 'pai.relay.shared';
const KEY_ENDPOINT = 'pai.relay.endpoint';
const RATCHET_PREFIX = 'pai.relay.ratchet.';

export interface RelayCredentials {
  deviceId: string;
  signingSecret: string;
  signingPub: string;
  sharedSecretHex: string;
  installationId: string;
  relayUrl: string;
  /** relay WS 连接 token（kind:device——ack 帧下发；过期后需重新配对/刷新）。 */
  relayToken: string;
}

/** KV 注入（MMKV 形态：同步 get/set；测试内存实现）。 */
export interface SyncKv {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

const memoryKv: SyncKv = (() => {
  const map = new Map<string, string>();
  return {
    get: (key) => map.get(key) ?? null,
    set: (key, value) => {
      map.set(key, value);
    },
  };
})();

let kv: SyncKv = memoryKv;

export function setRatchetKv(next: SyncKv): void {
  kv = next;
}

/** App 启动预载（SecureStore 异步 → 同步缓存；失败降级内存）。 */
export async function preloadRelayCredentials(): Promise<RelayCredentials | null> {
  try {
    const [device, shared, endpoint] = await Promise.all([
      secureGet(KEY_DEVICE),
      secureGet(KEY_SHARED),
      AsyncStorage.getItem(KEY_ENDPOINT),
    ]);
    if (device === null || shared === null) return null;
    const identity = JSON.parse(device) as { deviceId: string; signingSecret: string; signingPub: string; installationId: string; relayToken?: string };
    const endpointParsed = endpoint === null ? null : (JSON.parse(endpoint) as { relayUrl: string });
    const credentials: RelayCredentials = {
      deviceId: identity.deviceId,
      signingSecret: identity.signingSecret,
      signingPub: identity.signingPub,
      sharedSecretHex: shared,
      installationId: identity.installationId,
      relayUrl: endpointParsed?.relayUrl ?? '',
      relayToken: identity.relayToken ?? '',
    };
    cached = credentials;
    return credentials;
  } catch {
    return null;
  }
}

let cached: RelayCredentials | null = null;

export const relayCredentialsStore = {
  load(): RelayCredentials | null {
    return cached;
  },
  async save(next: RelayCredentials): Promise<boolean> {
    cached = next;
    try {
      await Promise.all([
        secureSet(KEY_DEVICE, JSON.stringify({ deviceId: next.deviceId, signingSecret: next.signingSecret, signingPub: next.signingPub, installationId: next.installationId, relayToken: next.relayToken })),
        secureSet(KEY_SHARED, next.sharedSecretHex),
        AsyncStorage.setItem(KEY_ENDPOINT, JSON.stringify({ relayUrl: next.relayUrl })),
      ]);
      return true;
    } catch {
      // 写失败可见化：保留缓存（本会话可用）——上层提示「凭证未持久化」
      return false;
    }
  },
  async clear(): Promise<void> {
    cached = null;
    try {
      await Promise.all([secureDelete(KEY_DEVICE), secureDelete(KEY_SHARED), AsyncStorage.removeItem(KEY_ENDPOINT)]);
    } catch {
      // 清理失败：缓存已空（下次预载拿不到凭证）
    }
  },
};

/** ratchet 边界存储（同步 KV——「批首落盘成功才放行发送」要求同步写）。 */
export function createKvRatchetStore(): RatchetBoundaryStore {
  return {
    async saveSend(deviceId, boundary) {
      await Promise.resolve();
      kv.set(`${RATCHET_PREFIX}${deviceId}.send`, JSON.stringify(boundary));
    },
    async saveRecv(deviceId, boundary) {
      await Promise.resolve();
      kv.set(`${RATCHET_PREFIX}${deviceId}.recv`, JSON.stringify(boundary));
    },
    async loadSend(deviceId) {
      await Promise.resolve();
      const raw = kv.get(`${RATCHET_PREFIX}${deviceId}.send`);
      return raw === null ? null : (JSON.parse(raw) as unknown);
    },
    async loadRecv(deviceId) {
      await Promise.resolve();
      const raw = kv.get(`${RATCHET_PREFIX}${deviceId}.recv`);
      return raw === null ? null : (JSON.parse(raw) as unknown);
    },
  };
}
