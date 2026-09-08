/** 侧栏会话卡片的展示字段（会话真相在 hub，这里只承载 UI 状态）。 */
export type SessionCardModel = {
  id: string;
  projectName: string;
  title: string;
  /** 模型展示名（provider/modelId；Usage 总览行的 model 列消费）。 */
  version: string;
  /** 工作目录（项目分组键与新会话快捷目录消费方）。 */
  cwd: string;
  /** 会话 jsonl 文件路径；null = 首条消息前未落盘（无置顶键）。 */
  sessionPath: string | null;
  /** 流式进行中（侧栏行内活动指示的数据源）。 */
  streaming: boolean;
  lastActivityAt: number;
};
