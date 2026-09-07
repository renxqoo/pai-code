// 测试替身：起 30ms 后无心跳直接退出（驱动连续失败→failed 相位路径）
export {};
setTimeout(() => process.exit(1), 30);
