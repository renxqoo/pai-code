import type { EditHunkView, ToolCallStatus } from '@paiapp/contracts';

/**
 * 共享派生函数的输入面：只声明消费到的最小形状（结构化兼容——
 * PC 的 ToolCallModel、移动端的 ChatMessage 适配对象都能直接喂，不逼任何一端换模型）。
 */

/** 名称引用：类别判定、组桶与图标语义的输入面。 */
export type ToolNameRef = { readonly name: string };

/** 状态引用：批次聚合态与开合策略的输入面。 */
export type ToolStatusRef = { readonly status: ToolCallStatus };

/** 名称 + 状态引用：执行行前缀的输入面。 */
export type ToolCallRef = ToolNameRef & ToolStatusRef;

/** 输出引用：详情展开条件的输入面。 */
export type ToolOutputRef = { readonly output: string };

/** 状态 + 输出引用：流式输出截取的输入面。 */
export type ToolDetailRef = ToolStatusRef & ToolOutputRef;

/** 补丁引用：文件级归并与变更计数的输入面。 */
export type EditCallRef = { readonly editHunks: readonly EditHunkView[] };
