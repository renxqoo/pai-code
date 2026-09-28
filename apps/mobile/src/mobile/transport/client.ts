/**
 * Client 接口适配（T58）：invoke/subscribe 形态与 @paiapp/contracts Client 同构
 * （UI/共享包零改动消费）；实现走 RelayTransport（relay 链路）。
 */
import { UiEventSchema, type ApiMethod, type Client, type ClientCapabilities, type UiEvent, type Unsubscribe } from '@paiapp/contracts';

type Subscriber = (event: UiEvent) => void;

/** invoke 面（RelayTransport 的子集——注入式，测试内存桩）。 */
export interface ClientTransportFace {
  sendCommand(spec: { command: string; id: string; args?: Record<string, unknown> }): Promise<boolean>;
  waitResponse(id: string, timeoutMs?: number): Promise<{ id: string; command: string; success: boolean; data?: unknown; error?: string }>;
}

export interface BridgeClientDeps {
  transport: ClientTransportFace;
  capabilities?: ClientCapabilities;
}

export interface BridgeClient extends Client {
  /** transport 事件泵接入点（装配层把 ws 回调接到这里）。 */
  dispatch(rawEvent: unknown): void;
}

let invokeCounter = 1;

export function createBridgeClient(deps: BridgeClientDeps): BridgeClient {
  const subscribers = new Set<Subscriber>();
  return {
    capabilities: deps.capabilities ?? { fileDialog: false, systemNotification: true },
    async invoke(method: ApiMethod, params: unknown): Promise<unknown> {
      const id = `c${invokeCounter++}`;
      const sent = await deps.transport.sendCommand({ command: method, id, args: (params ?? {}) as Record<string, unknown> });
      if (!sent) return { ok: false, error: { kind: 'transient', face: 'host_unavailable' } };
      const response = await deps.transport.waitResponse(id);
      return response.success ? { ok: true, data: response.data } : { ok: false, error: { kind: 'transient', message: response.error } };
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
