/// <reference types="vite/client" />

import type { PaiBridge } from '../../../preload/index';

declare global {
  interface Window {
    pai: PaiBridge;
  }
}

export {};
