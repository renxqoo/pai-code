import type { DemoThreadSpec } from './demo-thread-spec';
import { buildAnalysisScript } from './demo-turn-script';
import type { DiffSummaryModel, SessionMessage, TurnModel } from '@/thread/thread-model';
import type { SessionCardModel } from '@/sidebar/session-card-model';

export type ComposerState = {
  model: string;
  modelOptions: readonly string[];
  effort: string;
  contextUsed: number;
};

export type WorkspaceDemo = {
  sessions: readonly SessionCardModel[];
  activeSessionId: string;
  composer: ComposerState;
  threads: Readonly<Record<string, DemoThreadSpec>>;
};

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const now = Date.now();

/** 取最近一个指定钟点（当天未到则取昨天），用于演示轮次的时间戳行。 */
function clockAt(hours: number, minutes: number, at: number): number {
  const date = new Date(at);
  date.setHours(hours, minutes, 0, 0);
  if (date.getTime() > at) date.setDate(date.getDate() - 1);
  return date.getTime();
}

const greetingTurn: TurnModel = {
  id: 'turn-greeting',
  status: 'completed',
  startedAt: clockAt(10, 46, now) - 8 * MINUTE,
  endedAt: clockAt(10, 46, now),
  blocks: [
    {
      kind: 'text',
      id: 'greeting-text',
      text: [
        '先梳理一下仓库的工程化配置,从配置文件和目录约定开始:',
        '',
        '- **规范**: `.oxfmtrc.json` (oxc 的 lint/格式化配置)',
        '- **其他**: `bench/` (基准测试)、 `scripts/` 、 `.parity/` (与 Koa 的对齐验证)、 `.github/` 、 一个临时的 `bisect.tmp.mjs`',
        '',
        '门禁一键自检:',
        '',
        '```sh',
        'bun run lint && bun run typecheck && bun test',
        '```',
        '',
        '当前分支 v1.0.0 上有若干未提交的修改，涉及 `src/core` 、 `src/middleware` 、 `src/router` 下的文件和几个新增的回归测试，详见 [工程化约定](https://example.com/docs/engineering)。需要看哪部分细节告诉我即可。',
      ].join('\n'),
    },
    {
      kind: 'diff',
      id: 'greeting-diff',
      diff: {
        changedFiles: 375,
        additions: 34_000,
        deletions: 16_000,
        files: [
          { path: 'src/core/adapters/index.ts', additions: 214, deletions: 96 },
          { path: 'src/router/index.ts', additions: 118, deletions: 64 },
          { path: 'src/middleware/compose.ts', additions: 87, deletions: 41 },
          { path: 'test/router/match.test.ts', additions: 512, deletions: 8 },
          { path: 'bench/route-match.bench.ts', additions: 64, deletions: 12 },
          { path: '.github/workflows/ci.yml', additions: 22, deletions: 9 },
        ],
      } satisfies DiffSummaryModel,
    },
  ],
  streamingThinkingBlockId: null,
};

function session(id: string, title: string, ageInDays: number): SessionCardModel {
  return {
    id,
    projectName: 'bun-koa',
    title,
    version: 'v1.0.0',
    cwd: '/demo/bun-koa',
    sessionPath: `/demo/sessions/${id}.jsonl`,
    state: 'live',
    streaming: false,
    lastActivityAt: now - ageInDays * DAY,
  };
}

const userGreeting: SessionMessage = { id: 'm1', role: 'user', text: '帮我梳理一下当前仓库的工程化配置', images: [] };
const analyzeRequest: SessionMessage = { id: 'm2', role: 'user', text: '深度分析当前项目', images: [] };

export const demoWorkspace: WorkspaceDemo = {
  sessions: [session('session-1', '打个招呼', 3), session('session-2', '你好', 2)],
  activeSessionId: 'session-1',
  composer: {
    model: 'Claude Fable 5.1',
    modelOptions: ['Claude Fable 5.1', 'Claude Sonnet 4.5', 'Claude Haiku 4.5'],
    effort: 'High · 1M',
    contextUsed: 0.14,
  },
  threads: {
    'session-1': {
      sessionId: 'session-1',
      items: [
        { kind: 'message', message: userGreeting },
        { kind: 'turn', turn: greetingTurn },
        { kind: 'message', message: analyzeRequest },
        // 进行中的轮次起点回拨 76s，首帧即呈现设计稿的 "Working for 1m 16s"
        { kind: 'live-turn', turnId: 'turn-analysis', startedAt: now - 76_000, script: buildAnalysisScript() },
      ],
    },
    'session-2': { sessionId: 'session-2', items: [] },
  },
};
