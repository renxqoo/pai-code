// 测试替身：忽略 stdin EOF 且不心跳（常驻句柄保证 EOF 后仍存活，
// 驱动 dispose 的优雅退出超时 → SIGKILL 进程组兜底路径）
process.stdin.resume();
setInterval(() => undefined, 1_000);
export {};
