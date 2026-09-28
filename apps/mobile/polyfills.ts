/**
 * RN 全局 polyfill（T58 relay 链路）：
 * - Buffer（relay-protocol 协议子集的编解码面）
 * - crypto.getRandomValues（@noble 全部随机性的底层——expo-crypto）
 * 只在 App 最入口 import 一次（expo-router entry 之前经 _layout 顶部引入）。
 */
import { Buffer } from 'buffer';
import * as Crypto from 'expo-crypto';

if (typeof (globalThis as { Buffer?: unknown }).Buffer === 'undefined') {
  (globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
}

if (globalThis.crypto?.getRandomValues === undefined) {
  const getRandomValues = (array: Uint8Array): Uint8Array => {
    const bytes = Crypto.getRandomValues(new Uint8Array(array.length));
    array.set(bytes);
    return array;
  };
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: { getRandomValues },
  });
}
