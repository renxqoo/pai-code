# T37 流式 markdown 块冻结渲染 方案
> 状态：已实施（收口：四门全绿 + 对抗审查 P1×3 已修、P2 落档 2 项观察 4 项）
> 级别：中（新子模块 + 渲染一致性语义；无外部契约变更）
> 前序：T36。前置事实：50ms IPC 批推已退役（逐事件直发），流式渲染成本瓶颈实测在
> Streamdown——每 delta 对全文跑 `marked.Lexer.lex`（~0.09ms/KB，线性）+ 尾块渲染；
> 含 GFM 脚注的文本退化为整文单块（memo 全失效，实测 32KB→68ms/delta）。

## 契约

- **外部契约不变**：`MarkdownText({ text, className? })` props、渲染语义、消费方
  （`text-block.tsx` 消息流 / `file-pane.tsx` 文件面板）零改动。本方案是渲染层内部优化。
- **新内部模块** `thread/markdown-stream-cache.ts`（纯函数，零 React 依赖）：
  - `MarkdownStreamCache = { text, frozen: readonly string[], tail, footnote, math, mermaid }`
  - `nextMarkdownStreamCache(prev: Cache | null, text: string): Cache`——幂等：同 text
    返回同引用（下游 memo 命中前提）。
- **`useStreamdownPlugins` 签名变形**：`(needsMath, needsMermaid)` 布尔入参替代全文
  `text`（检测职责移交缓存模块的增量闩锁；hook 只管动态加载与插件表装配）。
  唯一调用方 `markdown-text.tsx`。

## 问题域

- 处理：把「在途流式文本」的每 delta 渲染成本从 O(消息全长) 降到 O(尾块)——
  利用 store `appendDelta` 的 append-only 不变量，自持冻结块缓存：
  已完结块一次性渲染（内容不变永不重渲），只有最后一块（live tail）实时渲染。
- 处理：math（`$$`）/mermaid（围栏）检测改为 append-only 闩锁（只扫 delta，
  命中永久置位）——替代现状每 render 两次全文扫描。
- 不处理：
  - **含 GFM 脚注（`[^id]`）的文本**：闩锁命中后回退整文单实例（对齐上游
    `parseMarkdownIntoBlocks` 的脚注快速路径——脚注解析需要整文档上下文）。
    该形态维持当前每 delta 全管线重渲（32KB→68ms 病态保持，**不消除**——
    修正讨论期「顺带消掉」的说法；LLM 输出脚注极罕见，正确性优先）。
    归属：未来如需根治，走「定义块注入各块 remark 前处理」或渲染调度，另立任务。
  - **跨块引用链接**（`[label]: url` 定义与引用分块）：上游本身就是分块独立渲染，
    本方案块边界与上游全量切分逐块等价（见测试口径），不引入新损失。
  - 超出 `clip`（4MB）的文本截断行为、`animated` 进场动画（现关闭）：维持现状。

## 一致性预算

- 每 delta 稳态成本 ≤ O(尾块)：切块只对 `prev.tail + delta`（实测 64KB 消息全程
  缓存成本 0.08ms/delta），渲染只重渲尾块（典型段 ~0.2ms；全链路含 act 实测
  稳态 ~2.5-4ms/commit，对照冻结缺失形态 ~11ms/commit）。
- 内存上界：缓存持有消息全文一份等价拷贝（frozen 拼接 + tail ≈ text），与现状
  单字符串同量级，无增长放大。
- 全量重建/全量重渲触发面（一次性 O(N)，非每 delta）：首次渲染、非前缀变化
  （messageFinal 权威替换）、脚注闩锁命中一次、math/mermaid 插件异步加载完成
  （plugins 引用变化 → 冻结块一次性重渲——插件就绪后块内 `$$`/围栏需重渲，行为必要）。
- 已知一次性成本（对抗审查实测，观察项）：file-pane 打开 4MB 静态大文件首渲染
  freezeCut ~470ms（与 Streamdown 内部词法双份，同数量级）。
- CRLF 行尾（对抗审查发现）：marked 的 token.raw 已剥 `\r`，raw 忠实复核必然
  失配——crlf 闩锁命中即整文单块形态（零冻结、零词法，成本回到块冻结之前）。

## 拆分

- `thread/markdown-stream-cache.ts`（新）：纯函数缓存状态机。切块复用 streamdown
  公开导出的 `parseMarkdownIntoBlocks`——**与上游同一把切刀**，边界等价由构造保证
  + 性质测试钉住。
- `thread/markdown-text.tsx`（改）：入口组件。frozen 各块 + tail 经同一个
  memo 化 chunk 组件渲染（共享稳定 props：components/translations/controls/
  linkSafety 全部提升为模块常量）；单块/脚注回退路径保持单实例 Streamdown。
- `thread/use-streamdown-plugins.ts`（改）：签名变形为布尔入参。
- 依赖方向：markdown-text → markdown-stream-cache / use-streamdown-plugins →
  streamdown（三方均为渲染层内部，无跨包新依赖）。

## 关键机制：增量切尾的边界等价

实施期修正（性质测试首跑即抓到）：marked 的 `token.raw` 对部分形态**不忠实**
（未完结列表项会合成尾换行；空行归属随构造不同——标题吃掉尾空行、段落不吃）。
因此块串只作「边界预言」，**冻结/尾区一律按原文偏移切真字符切片**：

```
freezeCut(region)：
  沿块序列推进累计偏移，逐块复核 raw 与原文逐字吻合（失真即止步——保守少冻结）；
  边界可冻结判据 = 原文在该偏移处恰以 '\n\n' 终止
  （markdown 无任何块级构造能跨空行延续：setext/懒续行/围栏都止于空行）
增量（prev 存在且 text.startsWith(prev.text)）：
  region = prev.tail + delta → cut = freezeCut(region)
  frozen += [region.slice(0, cut)]；tail = region.slice(cut)
否则（首次/非前缀替换）：全量同规则切一次
```

冻结粒度：增量路径多次冻结（多个切片）、全量路径一次冻结——拼接恒等
（frozen.join('') + tail === text 是测试钉住的不变量），渲染各切片独立进行，
粒度差异不影响渲染产物。

## 实施顺序

1. 纯函数缓存模块 + 性质测试（边界等价/闩锁/回退/替换重建/幂等引用）——独立可回滚；
2. `use-streamdown-plugins` 签名变形 + `MarkdownText` 接入 + 稳定 props；
3. 组件测试（分裂模式 DOM/终态同构/脚注回退）+ 压测扩展（64KB 长消息流式预算）；
4. 对抗审查（渲染一致性面）→ 修复 → 四门 → 提交。

## 裁决

- 块冻结方案本体：**用户裁决**（方案一，讨论期已确认）。
- 脚注文本回退单实例、病态保持：默认裁决（正确性优先；LLM 输出脚注罕见）——
  已修正讨论期「脚注悬崖一并消除」的表述，如需根治另立任务。
- 讨论期方案二（闩锁 + props 稳定化）并入本方案（闩锁是缓存模块的组成部分）。
- 讨论期方案三（useDeferredValue/rAF 渲染调度）：不做（用户未裁决需要；
  本方案落地后每 delta 亚毫秒，必要性消失）。

## 测试口径

- **边界等价性质**（表驱动 × 1 字符步进穷举切点 + 多步进抖动）：段/紧松列表/表格/
  围栏代码（含未闭合、含围栏内空行）/setext/`$$` 块/行内 HTML/blockquote 语料，
  任意 delta 切点下「冻结文本拼接 + 尾区」与全量切分一致；拼接恒等
  （frozen + tail === text）为独立不变量。
- **闩锁**：`$$`/mermaid 只在增量命中后置位（含标记跨 delta 边界形态）；
  非前缀替换全量重扫（可复位）。
- **脚注回退**：命中 → frozen 恒空、tail = 全文；后续 append 保持单块。
- **替换重建**：非前缀变化（messageFinal 口径）→ 全量重切一次；同 text → 同引用。
- **组件级**：分裂形态容器 + md-chunk 在场；终态同构（增量到达与一次性到达的
  最终渲染内容一致）；流式追加不重挂冻结块（DOM 节点同一）；脚注单实例。
- **性能门禁**：64KB 消息按 512B 增量流式，预算 8s（基线稳态 ~2.5-4ms/commit、
  纯缓存 0.08ms/delta；冻结失效回归形态 >30ms/commit 必爆）。

## 验收清单
- [ ] 外部契约（MarkdownText props/语义/消费方）零变化
- [ ] 边界等价性质测试全绿（含未闭合围栏/setext/`$$`）
- [ ] 闩锁/脚注回退/替换重建逐条用例
- [ ] 一致性预算：稳态每 delta O(尾块)（64KB 压测预算钉住）
- [ ] 四门全绿 + 覆盖率只升不降 + 对抗审查问题清零
