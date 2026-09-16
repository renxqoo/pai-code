# 贡献指南

工程规约的唯一真相是 [AGENTS.md](AGENTS.md)，提交前请通读。要点速览：

- **四门全绿**：`bun run lint`（0 error 0 warning）/ `bun run typecheck` / `bun run build` / `bun test`
- **覆盖率**：行 / 语句 / 函数 ≥ 90、分支 ≥ 85，只升不降；未达标只许补测试
- **提交**：Conventional Commits，正文引用任务文档节号（如 `T4 §实施顺序 M2`）；小步提交、每步可回滚
- **代码纪律**：单一真相（类型与 Port 只住 `packages/contracts/`）、零兼容层、一动词一文件；业务包不 `import 'electron'`；用户可见文案只写在 `renderer/src/strings/`
- **bug 修复必须带回归用例**，用例名注明症状

## 本地起手

```bash
bun install
bun run ci          # 先确认基线全绿
```

之后按 `tasks/` 对应任务文档的「实施顺序」推进；重构相关规则见 `rule/`。
