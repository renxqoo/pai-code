/** 侧栏会话卡片的展示字段（会话真相在 hub，这里只承载 UI 状态）。 */
export type SessionCardModel = {
  id: string;
  projectName: string;
  title: string;
  version: string;
  /** 工作目录（新会话快捷目录等消费方；不再仅是展示位）。 */
  cwd: string;
  /** 会话 jsonl 文件路径；null = 首条消息前未落盘（无置顶键）。 */
  sessionPath: string | null;
  /** 流式进行中（侧栏行内活动指示的数据源）。 */
  streaming: boolean;
  lastActivityAt: number;
};
