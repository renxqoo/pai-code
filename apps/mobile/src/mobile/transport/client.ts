/**
 * Client 接口适配（T57 §5）：invoke/subscribe 形态与 @paiapp/contracts Client 同构
 * （UI/共享包零改动消费）；实现走 WsTransport。
 * 事件路由：transport.onEvent → （运行时校验后）分发给订阅者。
 */
import { UiEventSchema, type ApiMethod, type Client, type ClientCapabilities, type UiEvent, type Unsubscribe } from '@paiapp/contracts';

import type { WsTransport } from './ws-client';

type Subscriber = (event: UiEvent) => void;

export interface BridgeClientDeps {
  transport: WsTransport;
  capabilities?: ClientCapabilities;
}

export interface BridgeClient extends Client {
  /** transport 事件泵接入点（装配层把 ws 回调接到这里）。 */
  dispatch(rawEvent: unknown): void;
}

export function createBridgeClient(deps: BridgeClientDeps): BridgeClient {
  const subscribers = new Set<Subscriber>();
  return {
    capabilities: deps.capabilities ?? { fileDialog: false, systemNotification: true },
    async invoke(method: ApiMethod, params: unknown): Promise<unknown> {
      const outcome = await deps.transport.invoke(method, params);
      return outcome.ok ? { ok: true, data: outcome.data } : { ok: false, error: outcome.error };
    },
    subscribe(onEvent: (event: UiEvent) => void): Unsubscribe {
      subscribers.add(onEvent);
      return () => {
        subscribers.delete(onEvent);
      };
    },
    dispatch(rawEvent: unknown): void {
      // 运行时形状守卫（桥透传未知事件形态——旧客户端不崩新事件）
      const parsed = UiEventSchema.safeParse(rawEvent);
      if (!parsed.success) return;
      for (const subscriber of Array.from(subscribers)) {
        try {
          subscriber(parsed.data);
        } catch {
          // 单订阅者异常隔离（与 testkit MockClient 同语义）
        }
      }
    },
  };
}
