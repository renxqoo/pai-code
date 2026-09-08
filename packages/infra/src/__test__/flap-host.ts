// 测试替身：发一个心跳转 ready，之后停跳——驱动 ready 后挂死重启路径（配合长退避测试 failed 复活）
process.stdout.write('{"type":"heartbeat"}\n');
process.stdin.resume();
setInterval(() => undefined, 60_000);
export {};
