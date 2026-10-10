/// <reference types="vite/client" />

import type { X3codeBridge } from '../../preload/index';

declare global {
  interface Window {
    x3code: X3codeBridge;
  }
}

export {};
