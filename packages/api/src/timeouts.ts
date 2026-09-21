/**
 * 命令超时档位（单一真相，自主进程 api-routes 迁入）：调用方不传档——域方法内定档
 * （约定见 T40 §2c）。bash 为 24h 长命档（长命令不得被缺省档误杀）。
 */
export const TIMEOUTS = {
  default: 30_000,
  prompt: 10 * 60_000,
  compact: 30 * 60_000,
  bash: 24 * 60 * 60_000,
} as const;
