import { jest } from '@jest/globals';
import { Image } from 'react-native';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));

// RN jest 预设的 Image.getSize mock 只兼容回调形态（promise 形态会去调 undefined 的 success）——补齐两态。
jest.spyOn(Image, 'getSize').mockImplementation(((_uri: string, success?: (width: number, height: number) => void) => {
  if (success !== undefined) {
    success(320, 240);
    return undefined as never;
  }
  return Promise.resolve({ width: 320, height: 240 }) as never;
}) as typeof Image.getSize);
