// 测试替身：spawn 后完全静默（无心跳无应答）——驱动「启动期假死」判定路径
process.stdin.resume();
setInterval(() => undefined, 60_000);
export {};
