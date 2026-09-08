/**
 * 会话主列宽度节奏（单一真相）：消息流、Composer、横幅/队列/确认条共用同一自适应列——
 * 窗口宽时封顶不超读宽，窄时随主区收缩；实际最小值由主进程窗口 minWidth 兜底。
 */
export const CONVERSATION_COLUMN_CLASS = 'mx-auto w-full max-w-[920px]';
