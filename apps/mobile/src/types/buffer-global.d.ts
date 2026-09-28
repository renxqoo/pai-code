/**
 * Buffer 全局声明（T58）：feross buffer polyfill 的全局形态（polyfills.ts 运行时注入；
 * 类型面在此声明——RN 无 node 类型）。Buffer 兼 import 与构造（静态 from/alloc 在构造面）。
 */
import { Buffer } from 'buffer';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-redeclare
  var Buffer: typeof Buffer;
}

export {};
