/**
 * 端到端装置的 RN 宿主替身（bun --preload 装载）。
 * 真机旅程跑移动端真代码，而 relay 链路只有三处碰原生面：react-native Platform、
 * expo-secure-store、async-storage——按真机语义替身，移动端源码零改动。
 */
import { plugin } from 'bun';

const SECURE_STORE = `
const store = new Map<string, string>();
export const getItemAsync = async (key) => store.get(key) ?? null;
export const setItemAsync = async (key, value) => { store.set(key, value); };
export const deleteItemAsync = async (key) => { store.delete(key); };
`;

const ASYNC_STORAGE = `
const store = new Map<string, string>();
export default {
  getItem: async (key) => store.get(key) ?? null,
  setItem: async (key, value) => { store.set(key, value); },
  removeItem: async (key) => { store.delete(key); },
  getAllKeys: async () => [...store.keys()],
  multiRemove: async (keys) => { for (const key of keys) store.delete(key); },
};
`;

const REACT_NATIVE = `
const OS = process.env.PAI_E2E_PLATFORM === 'ios' ? 'ios' : 'web';
export const Platform = { OS, select: (spec) => spec[OS] ?? spec.default };
`;

plugin({
  name: 'pai-relay-e2e-rn-shims',
  setup(build) {
    build.module('react-native', () => ({ contents: REACT_NATIVE, loader: 'ts' }));
    build.module('expo-secure-store', () => ({ contents: SECURE_STORE, loader: 'ts' }));
    build.module('@react-native-async-storage/async-storage', () => ({ contents: ASYNC_STORAGE, loader: 'ts' }));
  },
});