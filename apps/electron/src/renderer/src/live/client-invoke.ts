import type { ApiMethod, ApiOutcome, ApiParams } from '@paiapp/contracts';

/**
 * preload 桥的 typed invoke：window.pai 存在时走 IPC，
 * 浏览器直开（无 preload）返回 unavailable —— 组件层据此降级为空形态。
 */
export interface BridgeClient {
  invoke<M extends ApiMethod>(method: M, params: ApiParams<M>): Promise<ApiOutcome<M>>;
  subscribe(onEvent: (event: unknown) => void): () => void;
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
    subscribe(onEvent: (event: unknown) => void): () => void {
      return bridge?.subscribe(onEvent) ?? (() => undefined);
    },
  };
}
