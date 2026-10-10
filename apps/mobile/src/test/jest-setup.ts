import { jest } from '@jest/globals';
import { Image } from 'react-native';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('expo-constants', () => ({
  default: { expoConfig: null, expoGoConfig: null },
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));

// RN jest 预设的 Image.getSize mock 只兼容回调形态（promise 形态会去调 undefined 的 success）——补齐两态。
jest.spyOn(Image, 'getSize').mockImplementation(((_uri: string, success?: (width: number, height: number) => void) => {
  if (success !== undefined) {
    success(320, 240);
    return undefined as never;
  }
  return Promise.resolve({ width: 320, height: 240 }) as never;
}) as typeof Image.getSize);
