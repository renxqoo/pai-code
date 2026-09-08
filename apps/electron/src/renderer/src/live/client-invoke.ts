import type { ApiMethod, ApiOutcome, ApiParams } from '@paiapp/contracts';

/**
 * preload 桥的 typed invoke：window.pai 存在时走 IPC，
 * 浏览器直开（无 preload）返回 unavailable —— 组件层据此降级为空形态。
 * subscribe 统一批形态（单事件包装为单元素数组）：消费方在批粒度折叠相邻 delta
 * （coalesceEvents），store 每批每块至多折叠一次。
 */
export interface BridgeClient {
  invoke<M extends ApiMethod>(method: M, params: ApiParams<M>): Promise<ApiOutcome<M>>;
  subscribe(onBatch: (events: readonly unknown[]) => void): () => void;
  readonly available: boolean;
}

/** preload 桥的最小结构面（不依赖全局 Window 类型解析）。 */
export interface PreloadBridgeShape {
  invoke(method: string, params: unknown): Promise<unknown>;
  subscribe(onEvent: (event: unknown) => void): () => void;
}

export function createBridgeClient(bridge: PreloadBridgeShape | undefined): BridgeClient {
  return {
    get available(): boolean {
      return bridge !== undefined;
    },
    async invoke<M extends ApiMethod>(method: M, params: ApiParams<M>): Promise<ApiOutcome<M>> {
      if (bridge === undefined) return { ok: false, reason: 'bridge_unavailable' };
      return (await bridge.invoke(method, params)) as ApiOutcome<M>;
    },
    subscribe(onBatch: (events: readonly unknown[]) => void): () => void {
      return (
        bridge?.subscribe((payload) => {
          // 主进程 50ms 批推：数组与单事件双形态统一为批
          onBatch(Array.isArray(payload) ? payload : [payload]);
        }) ?? (() => undefined)
      );
    },
  };
}
