/**
 * relay 凭证与持久化（T58）：配对产物（设备身份/sharedSecret）走 SecureStore、
 * ratchet 边界走同步 KV（MMKV 形态——注入式；测试内存实现）。异步预载 + 同步读。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { RatchetBoundaryStore } from './ratchet-codec';

/** 安全存储面（R2 M7）：原生只走 SecureStore（异常即失败——不静默降级明文，
 *  内存态本会话可用且 save 返回 false 由 UI 提示）；web 无硬件背书秘密存储，
 *  长期钥不落盘（内存单会话，重启重新配对——诚实降级优于 localStorage 假安全）；
 *  endpoint（relayUrl，非秘密）仍走 AsyncStorage。 */
import { Platform } from 'react-native';

const secureAvailable = Platform.OS !== 'web';

const secureGet = async (key: string): Promise<string | null> => {
  if (!secureAvailable) {
    try {
      return globalThis.sessionStorage?.getItem(`pai.web.${key}`) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
};
const secureSet = async (key: string, value: string): Promise<void> => {
  if (!secureAvailable) {
    try {
      globalThis.sessionStorage?.setItem(`pai.web.${key}`, value);
    } catch {
      // 无 sessionStorage（隐私模式）——内存单会话语义，save 仍报成功（App 内 cached 已生效）
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
};
const secureDelete = async (key: string): Promise<void> => {
  if (!secureAvailable) {
    try {
      globalThis.sessionStorage?.removeItem(`pai.web.${key}`);
    } catch {
      // 同上
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
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
  /** relay WS 连接 token（kind:device——ack 帧下发；过期后签名挑战续期）。 */
  relayToken: string;
  /** relay 节点 id（refresh 挑战转录域；注册时缓存，可经 /api/node-key 探测）。 */
  relayNodeId?: string;
}

/** KV 注入（MMKV 形态：同步 get/set；测试内存实现）。 */
export interface SyncKv {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

/** ratchet 边界持久写（R3 M2：seal 语义「批首落盘成功才放行发送」——异步写必须可等待；
 *  内存 Map 先记（同步读面），pending 尾链串行化落盘，失败拒绝（fail-closed 拒发）。 */
const kvPending = new Map<string, Promise<void>>();
const memoryKv: SyncKv = (() => {
  const map = new Map<string, string>();
  return {
    get: (key) => map.get(key) ?? null,
    set: (key, value) => {
      map.set(key, value);
      const previous = kvPending.get(key) ?? Promise.resolve();
      const next = previous.then(() => AsyncStorage.setItem(`kv:${key}`, value));
      kvPending.set(key, next);
      void next.catch(() => undefined).finally(() => {
        if (kvPending.get(key) === next) kvPending.delete(key);
      });
    },
  };
})();
/** 等待全部在途边界写完成（RatchetBoundaryStore 保存面调用——落盘成功才放行）。 */
export async function awaitKvFlush(): Promise<void> {
  await Promise.all(kvPending.values());
}

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
    const endpointParsed = endpoint === null ? null : (JSON.parse(endpoint) as { relayUrl?: string; relayNodeId?: string });
    const credentials: RelayCredentials = {
      deviceId: identity.deviceId,
      signingSecret: identity.signingSecret,
      signingPub: identity.signingPub,
      sharedSecretHex: shared,
      installationId: identity.installationId,
      relayUrl: endpointParsed?.relayUrl ?? '',
      relayToken: identity.relayToken ?? '',
      ...(endpointParsed?.relayNodeId !== undefined ? { relayNodeId: endpointParsed.relayNodeId } : {}),
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
      await AsyncStorage.setItem(KEY_ENDPOINT, JSON.stringify({ relayUrl: next.relayUrl, ...(next.relayNodeId !== undefined ? { relayNodeId: next.relayNodeId } : {}) }));
      await Promise.all([
        secureSet(KEY_DEVICE, JSON.stringify({ deviceId: next.deviceId, signingSecret: next.signingSecret, signingPub: next.signingPub, installationId: next.installationId, relayToken: next.relayToken })),
        secureSet(KEY_SHARED, next.sharedSecretHex),
      ]);
      return true;
    } catch {
      return false; // 持久层失败：内存态本会话可用——UI 提示「凭证未持久化」
    }
  },
  async clear(): Promise<void> {
    cached = null;
    try {
      await Promise.all([secureDelete(KEY_DEVICE), secureDelete(KEY_SHARED), AsyncStorage.removeItem(KEY_ENDPOINT)]);
      // ratchet KV 前缀清（M-3：链钥材料不滞留）
      const keys = await AsyncStorage.getAllKeys();
      const ratchetKeys = keys.filter((key) => key.startsWith(`kv:${RATCHET_PREFIX}`));
      await AsyncStorage.multiRemove(ratchetKeys);
    } catch {
      // 清理失败：缓存已空（下次预载拿不到凭证）
    }
  },
};

/** ratchet 边界存储：同步 KV 写穿（内存 Map + AsyncStorage 持久）；load 先内存后持久。 */
export function createKvRatchetStore(): RatchetBoundaryStore {
  return {
    async saveSend(deviceId, boundary) {
      kv.set(`${RATCHET_PREFIX}${deviceId}.send`, JSON.stringify(boundary));
      await awaitKvFlush(); // R3 M2：持久写完成才返回（ratchet seal 的放行条件）
    },
    async saveRecv(deviceId, boundary) {
      kv.set(`${RATCHET_PREFIX}${deviceId}.recv`, JSON.stringify(boundary));
      await awaitKvFlush();
    },
    async loadSend(deviceId) {
      await Promise.resolve();
      const key = `${RATCHET_PREFIX}${deviceId}.send`;
      const mem = kv.get(key);
      if (mem !== null) return JSON.parse(mem) as unknown;
      const persisted = await AsyncStorage.getItem(`kv:${key}`).catch(() => null);
      if (persisted === null) return null;
      kv.set(key, persisted);
      return JSON.parse(persisted) as unknown;
    },
    async loadRecv(deviceId) {
      await Promise.resolve();
      const key = `${RATCHET_PREFIX}${deviceId}.recv`;
      const mem = kv.get(key);
      if (mem !== null) return JSON.parse(mem) as unknown;
      const persisted = await AsyncStorage.getItem(`kv:${key}`).catch(() => null);
      if (persisted === null) return null;
      kv.set(key, persisted);
      return JSON.parse(persisted) as unknown;
    },
  };
}
