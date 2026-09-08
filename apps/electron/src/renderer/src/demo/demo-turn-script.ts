import type { DiffSummaryModel } from '@/thread/thread-model';

/**
 * 演示轮次脚本：一条带时间轴的静态剧本，由 derive-demo-turn 在任意时刻
 * 折算成当刻的视图模型。所有时刻均相对轮次起点（ms）。
 * 接 Client（T8）后由事件流直接产出 TurnModel，这套剧本随之退役。
 */

export type DemoCommandStep = {
  atMs: number;
  durationMs: number;
  command: string;
  output: string;
  exitCode: number;
};

export type DemoAgentToolStep = {
  atMs: number;
  durationMs: number;
  name: string;
  argsPreview: string;
};

export type DemoAgentSeed = {
  id: string;
  name: string;
  agentType: string;
  model: string;
  effort: string;
  /** 相对所属块出现时刻的出生偏移 */
  bornAtMs: number;
  /** 相对出生时刻的工具时间线（顺序执行，同一时刻至多一个在跑） */
  tools: readonly DemoAgentToolStep[];
  tokens: number | null;
  /** token 计量出现时刻（相对出生）；null = 一直无计量 */
  tokensAtMs: number | null;
  /** 相对出生的收尾时刻；null = 一直运行 */
  doneAfterMs: number | null;
  /** 完成后的报告摘要（面板完成态展示） */
  summary: string;
};

export type DemoBlockSpec =
  | { kind: 'text'; id: string; atMs: number; text: string }
  | { kind: 'commands'; id: string; atMs: number; commands: readonly DemoCommandStep[] }
  | { kind: 'subagents'; id: string; atMs: number; agents: readonly DemoAgentSeed[] }
  | { kind: 'diff'; id: string; atMs: number; diff: DiffSummaryModel };

export type DemoTurnScript = {
  blocks: readonly DemoBlockSpec[];
  /** 相对轮次起点的自动收尾时刻；null = 不会自动完成 */
  completeAtMs: number | null;
};

/** 交替的只读工具时间线：短工具连跑，出生到收尾之间绝大多数时刻都有工具在跑。 */
function readCycle(steps: readonly string[], stepMs: number, untilMs?: number): readonly DemoAgentToolStep[] {
  const names = ['Read', 'Glob', 'Grep', 'Read', 'Grep', 'Read', 'Glob'];
  const durationMs = Math.round(stepMs * 0.72);
  const count = untilMs === undefined ? steps.length : Math.max(steps.length, Math.ceil(untilMs / stepMs));
  return Array.from({ length: count }, (_item, index) => ({
    atMs: index * stepMs,
    durationMs,
    name: names[index % names.length] ?? 'Read',
    argsPreview: steps[index % steps.length] ?? 'src/index.ts',
  }));
}

/** 深度分析剧本：与设计稿一致的命令、子代理与汇报节奏。 */
export function buildAnalysisScript(): DemoTurnScript {
  return {
    blocks: [
      {
        kind: 'text',
        id: 'text-intro',
        atMs: 0,
        text: '我来做一次全面的项目分析。先看整体结构和元数据，再深入源码。',
      },
      {
        kind: 'commands',
        id: 'commands-scan',
        atMs: 1200,
        commands: [
          {
            atMs: 0,
            durationMs: 2600,
            command: 'cat /Users/wrr/work/bun-koa/package.json',
            output: [
              '{',
              '  "name": "bun-koa",',
              '  "version": "0.6.2",',
              '  "type": "module",',
              '  "scripts": { "test": "bun test", "lint": "oxlint ." }',
              '}',
            ].join('\n'),
            exitCode: 0,
          },
          {
            atMs: 4200,
            durationMs: 5200,
            command: 'find /Users/wrr/work/bun-koa/src -type f | sort',
            output: [
              '/Users/wrr/work/bun-koa/src/core/adapters/index.ts',
              '/Users/wrr/work/bun-koa/src/core/router/match.ts',
              '/Users/wrr/work/bun-koa/src/middleware/compose.ts',
              '/Users/wrr/work/bun-koa/src/router/index.ts',
            ].join('\n'),
            exitCode: 0,
          },
          {
            atMs: 11200,
            durationMs: 9800,
            command:
              'git log --oneline -30 && echo "---DIFF STAT---" && git diff --stat && echo "---BRANCHES---" && git branch --show-current',
            output: [
              'a91c2f3 fix(router): trie 兜底匹配',
              '7d0e5b1 refactor(core): compose 预编译',
              '---DIFF STAT---',
              ' src/router/index.ts   | 42 ++++++----',
              ' src/core/adapters/index.ts | 18 ++--',
              '---BRANCHES---',
              'main',
            ].join('\n'),
            exitCode: 0,
          },
        ],
      },
      {
        kind: 'text',
        id: 'text-plan',
        atMs: 44000,
        text: '当前分支是 `0.6.2` (不是我之前说的 v1.0.0,已确认), 有 9 个文件的未提交修改。我派几个并行子代理分头深入源码、测试和基准设施,同时自己看文档和未提交的改动。',
      },
      {
        kind: 'subagents',
        id: 'subagents-parallel',
        atMs: 47000,
        agents: [
          {
            id: 'agent-adapters',
            name: '分析 core/adapters 架构',
            agentType: 'Explore',
            model: 'glm-5.3',
            effort: 'high',
            bornAtMs: 0,
            tools: readCycle(
              [
                'src/core/adapters/index.ts',
                'src/core/adapters/*.ts',
                'sink 调用点',
                'src/core/adapters/sink.ts',
                'adapter 注册表',
                'src/core/adapters/registry.ts',
                '生命周期钩子',
              ],
              4400,
              88_000,
            ),
            tokens: 51,
            tokensAtMs: 9000,
            doneAfterMs: 90_000,
            summary:
              '# keala 核心运行时分析报告 **规模**:src/core + adapters 共 7339 行(32 文件,最大 sink.ts),核心是 sink 双活与生命周期漏斗。',
          },
          {
            id: 'agent-router',
            name: '分析 router 实现',
            agentType: 'Explore',
            model: 'glm-5.3',
            effort: 'high',
            bornAtMs: 6000,
            tools: readCycle(
              [
                'src/router/index.ts',
                'match.ts',
                'matchRoute 调用方',
                'src/router/match.ts',
                '静态 Map 构建',
                'trie 兜底分支',
                'src/router/trie.ts',
                '路由表加载',
              ],
              3200,
              108_000,
            ),
            tokens: 51,
            tokensAtMs: 8000,
            doneAfterMs: 110_000,
            summary:
              '# keala 路由子系统分析报告 ## 1. 整体策略:hybrid 四层分发(match.ts:93-128 `matchRoute`),静态 Map → 快速 matcher → 整表 regex → trie 兜底。',
          },
          {
            id: 'agent-middleware',
            name: '分析中间件与插件',
            agentType: 'Explore',
            model: 'glm-5.3',
            effort: 'high',
            bornAtMs: 14000,
            tools: readCycle(['src/middleware/compose.ts', 'compose 调用点', '插件注册顺序', 'src/middleware/index.ts'], 4200, 118_000),
            tokens: 94,
            tokensAtMs: 7000,
            doneAfterMs: 120_000,
            summary: '中间件层只有 compose 一条主链,插件按注册顺序串行;审计恢复逻辑挂在第二段。',
          },
          {
            id: 'agent-testing',
            name: '分析测试/基准/工程化',
            agentType: 'general-purpose',
            model: 'fable-5-1',
            effort: 'high',
            bornAtMs: 23000,
            tools: [],
            tokens: null,
            tokensAtMs: null,
            doneAfterMs: 115_000,
            summary: '所有探索工作已完成。唯一未完成的项目是后台 vitest+coverage 运行(任务 b2i2838xb)。',
          },
        ],
      },
      {
        kind: 'text',
        id: 'text-report',
        atMs: 126_000,
        text: [
          '四个子代理全部收工,汇总如下:',
          '',
          '| 模块 | 行数 | 主要发现 |',
          '| --- | --- | --- |',
          '| `core/adapters` | 7,339 | sink 双活与生命周期漏斗 |',
          '| `router` | 1,204 | hybrid 四层分发,trie 兜底 |',
          '| `middleware` | 486 | compose 单主链,插件按注册顺序串行 |',
          '',
          '关键路径片段:',
          '',
          '```python',
          'def match_route(path: str) -> Route | None:',
          '    return static_map.get(path) or trie.match(path)',
          '```',
          '',
          '完整结论见 [分析报告](https://example.com/docs/analysis),需要我直接开一轮修复吗?',
        ].join('\n'),
      },
    ],
    completeAtMs: 190_000,
  };
}

/** 用户追问剧本：更短的一轮，便于演示第二次完整生命周期。 */
export function buildFollowUpScript(): DemoTurnScript {
  return {
    blocks: [
      {
        kind: 'text',
        id: 'text-followup',
        atMs: 0,
        text: '先看路由的 `matchRoute`,再顺着调用链把 trie 兜底那段读完。',
      },
      {
        kind: 'commands',
        id: 'commands-followup',
        atMs: 800,
        commands: [
          {
            atMs: 0,
            durationMs: 3200,
            command: 'grep -rn "matchRoute" /Users/wrr/work/bun-koa/src | head -20',
            output: [
              'src/router/index.ts:41  export function matchRoute()',
              'src/router/index.ts:118    matchRoute(ctx.path)',
              'src/middleware/compose.ts:22  matchRoute(req.url)',
            ].join('\n'),
            exitCode: 0,
          },
          {
            atMs: 4600,
            durationMs: 5400,
            command: 'sed -n 90,150p /Users/wrr/work/bun-koa/src/router/trie.ts',
            output: 'sed: /Users/wrr/work/bun-koa/src/router/trie.ts: No such file or directory',
            exitCode: 1,
          },
        ],
      },
    ],
    completeAtMs: 46_000,
  };
}
