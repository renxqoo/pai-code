import type { ApiMethod, Client, ClientCapabilities, UiEvent, Unsubscribe } from '@paiapp/contracts';

type Handler = (params: unknown) => unknown;

/**
 * Client 接口的内存实现：渲染层开发与组件测试的注入物。
 * 语义：subscribe 只接收订阅之后 emit 的事件（晚订阅不重放）；同一函数重复订阅
 * 各自独立退订（与 preload 传输一致）；单个订阅者抛错被隔离并记账，不影响其他订阅者。
 */
export class MockClient implements Client {
  readonly capabilities: ClientCapabilities;
  readonly eventLog: UiEvent[] = [];
  readonly subscriberErrors: unknown[] = [];
  private readonly handlers = new Map<ApiMethod, Handler>();
  private readonly subscribers: Array<(e: UiEvent) => void> = [];

  constructor(capabilities: ClientCapabilities = { fileDialog: true, systemNotification: true }) {
    this.capabilities = capabilities;
  }

  handle(method: ApiMethod, fn: Handler): void {
    this.handlers.set(method, fn);
  }

  async invoke(method: ApiMethod, params: unknown): Promise<unknown> {
    const h = this.handlers.get(method);
    if (!h) throw new Error(`unknown_method: ${method}`);
    return await h(params);
  }

  subscribe(onEvent: (e: UiEvent) => void): Unsubscribe {
    this.subscribers.push(onEvent);
    return () => {
      const i = this.subscribers.indexOf(onEvent);
      if (i >= 0) this.subscribers.splice(i, 1);
    };
  }

  emit(e: UiEvent): void {
    this.eventLog.push(e);
    for (const s of Array.from(this.subscribers)) {
      try {
        s(e);
      } catch (err) {
        this.subscriberErrors.push(err);
      }
    }
  }
}
