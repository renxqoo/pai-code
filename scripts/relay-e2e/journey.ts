/**
 * 手机端真机旅程（端到端）：PC 侧真 relay + 真 hub-gateway + 真 host-hub，
 * 手机侧跑 apps/mobile 真代码（配对会话 → ratchet 传输 → Client 门面 → 事件泵 → store）。
 *
 * 跑法（cwd = apps/mobile，让 @/ 别名与真机 tsconfig 一致）：
 *   bun --preload ../../scripts/relay-e2e/preload.ts ../../scripts/relay-e2e/journey.ts
 */
import { decodeEnvelope } from '../../packages/relay-protocol/src/index';

import { connectOwner } from './owner-driver';
import { startPcStack, sleep, waitFor, type PcStack } from './stack';
import { dialWebSocket } from '../../apps/mobile/src/mobile/relay/ws-dial';
import { createPairingSession, generateDeviceIdentity, type PairingWire } from '../../apps/mobile/src/mobile/relay/pairing';
import { relayCredentialsStore, type RelayCredentials } from '../../apps/mobile/src/mobile/relay/credentials';
import {
  attachThread,
  bootstrapRelayRuntime,
  getRelayRuntime,
  hydrateThread,
  loadBootstrap,
  reviveThread,
} from '../../apps/mobile/src/mobile/relay/runtime';
import { useConversationStore } from '../../apps/mobile/src/store/conversation-store';
import { useHistoryStore } from '../../apps/mobile/src/store/history-store';
import type { ChatMessage } from '../../apps/mobile/src/types/domain';

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

const checks: Check[] = [];

function record(name: string, ok: boolean, detail: string): void {
  checks.push({ name, ok, detail });
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail.length > 0 ? ` — ${detail}` : ''}\n`);
}

async function step(name: string, run: () => Promise<string>): Promise<void> {
  try {
    record(name, true, await run());
  } catch (error) {
    record(name, false, error instanceof Error ? error.message : String(error));
  }
}

/** 手机 pairing 面 wire：WebSocket + L3 明文信封。 */
function pairingWire(relayUrl: string, ticket: string): PairingWire {
  const socket = dialWebSocket(`${relayUrl}/pairing`, ticket);
  const listeners = new Set<(message: Record<string, unknown>) => void>();
  const opened = new Promise<boolean>((resolve) => {
    socket.onopen = () => resolve(true);
    socket.onerror = () => resolve(false);
  });
  socket.onmessage = (event: unknown) => {
    const env = decodeEnvelope(String((event as { data: unknown }).data));
    if (env === null) return;
    try {
      const message = JSON.parse(Buffer.from(env.payload, 'base64').toString('utf8')) as Record<string, unknown>;
      for (const listener of listeners) listener(message);
    } catch {
      // 非 JSON 信封行：忽略
    }
  };
  return {
    opened: () => opened,
    send: (payload: unknown) => socket.send(typeof payload === 'string' ? payload : JSON.stringify(payload)),
    onMessage: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    close: () => socket.close(),
  };
}

interface PairedPhone {
  credentials: RelayCredentials;
  relayUrl: string;
}

async function pairPhone(stack: PcStack): Promise<PairedPhone> {
  const owner = await connectOwner(stack.ownerSocketPath);
  try {
    const started = await owner.send('gw/pairing/start', { scope: 'interact' });
    if (!started.success) throw new Error(`gw/pairing/start failed: ${String(started.error)}`);
    const payload = JSON.parse((started.data as { qrPayload: string }).qrPayload) as {
      relayUrl: string;
      installationId: string;
      pairingId: string;
      pairingTicket: string;
      gwEphemeralPub: string;
      gatewayKeyFingerprint: string;
    };

    const wire = pairingWire(payload.relayUrl, payload.pairingTicket);
    const session = createPairingSession({
      wire,
      endpoints: {
        relayUrl: payload.relayUrl,
        installationId: payload.installationId,
        gatewayKeyFingerprint: payload.gatewayKeyFingerprint,
      },
      pairingId: payload.pairingId,
      gatewayEphemeralPub: payload.gwEphemeralPub,
      deviceInfo: { name: 'E2E Phone', deviceType: 'phone', platform: 'ios', appVersion: '1' },
    });

    const identity = generateDeviceIdentity();
    await waitFor('sas 展示', () => session.sas ?? null);
    const sas = session.sas ?? '';
    await session.submitDeviceKeys({ deviceId: identity.deviceId, signingSecret: identity.signingSecret, signingPub: identity.signingPub });
    const confirmed = await owner.send('gw/pairing/confirm', {
      pairingId: payload.pairingId,
      ownerTypedSas: sas,
      deviceLongTermPub: identity.signingPub,
    });
    if (!confirmed.success) throw new Error(`gw/pairing/confirm failed: ${String(confirmed.error)}`);

    const registered = await session.waitRegistered(20_000);
    if (!registered.ok) throw new Error(`device registration failed: ${registered.reason}`);
    session.close();
    const relayToken = session.relayToken;
    const ownerDeviceId = (confirmed.data as { deviceId?: string } | undefined)?.deviceId ?? null;
    const deviceId = session.registeredDeviceId ?? ownerDeviceId;
    if (relayToken === null || deviceId === null) throw new Error('pairing ack missing relayToken/deviceId');
    return {
      relayUrl: payload.relayUrl,
      credentials: {
        deviceId,
        signingSecret: identity.signingSecret,
        signingPub: identity.signingPub,
        sharedSecretHex: registered.sharedSecret,
        installationId: payload.installationId,
        relayUrl: payload.relayUrl,
        relayToken,
      },
    };
  } finally {
    owner.close();
  }
}

function messages(): ChatMessage[] {
  return useConversationStore.getState().session.messages;
}

async function main(): Promise<void> {
  const stack = await startPcStack();
  process.stdout.write(`PC 栈就绪：relay :${stack.relayPort}  agentDir ${stack.agentDir}\n`);
  try {
    let paired: PairedPhone | null = null;

    await step('配对旅程（QR 载荷 → SAS → ack 拿 relayToken）', async () => {
      paired = await pairPhone(stack);
      return `device ${paired.credentials.deviceId} seed ${paired.credentials.sharedSecretHex.slice(0, 12)}…`;
    });
    if (paired === null) throw new Error('配对未完成，后续旅程中止');

    const credentials = (paired as PairedPhone).credentials;
    await relayCredentialsStore.save(credentials);

    await step('runtime 自动连接（凭证 → relay → gateway）', async () => {
      await bootstrapRelayRuntime();
      const runtime = await waitFor('transport ready', () => {
        const current = getRelayRuntime();
        return current !== null && (current.status === 'ready' || current.status === 'connected') ? current : null;
      }, 20_000);
      return `status ${runtime.status}`;
    });

    await step('启动数据装载（thread/list → 历史列表）', async () => {
      const runtime = getRelayRuntime();
      if (runtime === null) throw new Error('runtime missing');
      await loadBootstrap(runtime.client);
      await sleep(300);
      const sessions = useHistoryStore.getState().sessions;
      return `sessions ${sessions.length}`;
    });

    await step('探针：移动端所用 host 命令的原始应答', async () => {
      const runtime = getRelayRuntime();
      if (runtime === null) throw new Error('runtime missing');
      const probes: Array<[string, string, Record<string, unknown>]> = [
        ['thread/list', 'thread/list', {}],
        ['thread/list_saved', 'thread/list_saved', {}],
        ['thread/list_saved+cwd', 'thread/list_saved', { cwd: process.cwd() }],
        ['get_models', 'get_models', {}],
        ['get_state', 'get_state', {}],
        ['get_session_stats', 'get_session_stats', {}],
        ['settings/get', 'settings/get', {}],
        ['agents/list', 'agents/list', {}],
        ['skills/list', 'skills/list', {}],
        ['permission/get_mode', 'permission/get_mode', {}],
        ['get_commands', 'get_commands', {}],
        ['get_host_info', 'get_host_info', {}],
      ];
      const lines: string[] = [];
      for (const [label, command, args] of probes) {
        const out = (await runtime.client.invoke(command as never, args)) as { ok: boolean; data?: unknown; error?: { message?: string } };
        lines.push(`${label} ok=${out.ok} ${JSON.stringify(out.ok ? out.data : out.error).slice(0, 220)}`);
      }
      return `\n    ${lines.join('\n    ')}`;
    });

    await step('发送消息（session/start → session/prompt）', async () => {
      const runtime = getRelayRuntime();
      if (runtime === null) throw new Error('runtime missing');
      attachThread(null);
      const started = (await runtime.client.invoke('session/start', { cwd: process.cwd(), trusted: true })) as {
        ok: boolean;
        data?: { threadId?: string };
        error?: { message?: string };
      };
      if (!started.ok || typeof started.data?.threadId !== 'string') {
        throw new Error(`session/start 失败: ${started.ok ? '无 threadId' : (started.error?.message ?? 'unknown')}`);
      }
      const threadId = started.data.threadId;
      useConversationStore.getState().openSession({ ...useConversationStore.getState().session, id: threadId });
      attachThread(threadId);
      const prompted = (await runtime.client.invoke('session/prompt', { threadId, message: 'say hi' })) as {
        ok: boolean;
        error?: { message?: string };
      };
      if (!prompted.ok) throw new Error(`session/prompt 失败: ${prompted.error?.message ?? 'unknown'}`);
      return `thread ${threadId}`;
    });

    await step('流式事件上屏（assistant 文本落到会话 store）', async () => {
      await waitFor('assistant 文本', () => messages().some((message) => message.kind === 'assistant' && message.text.includes('hello from scripted llm')), 45_000);
      const kinds = messages().map((message) => message.kind);
      return `${messages().length} 行 [${kinds.join(',')}]`;
    });

    await step('生成态收敛（turnSettled → generating=false）', async () => {
      await waitFor('turn settled', () => messages().some((message) => message.kind === 'assistant' && message.text.length > 0), 45_000);
      return 'settled';
    });

    await step('探针：PC 侧 sidebar 依赖的会话字段（title/model/lastActivityAt）', async () => {
      const runtime = getRelayRuntime();
      if (runtime === null) throw new Error('runtime missing');
      const live = (await runtime.client.invoke('thread/list', {})) as { ok: boolean; data?: unknown };
      const saved = (await runtime.client.invoke('thread/list_saved', {})) as { ok: boolean; data?: unknown };
      return `\n    thread/list → ${JSON.stringify(live.data ?? live).slice(0, 400)}\n    thread/list_saved → ${JSON.stringify(saved.data ?? saved).slice(0, 400)}`;
    });

    await step('历史水化（session/entries 回读同一线程）', async () => {
      const threadId = useConversationStore.getState().activeSessionId;
      if (threadId === null) throw new Error('no active thread');
      useConversationStore.getState().startNewSession();
      attachThread(threadId);
      await hydrateThread(threadId);
      const hydrated = messages();
      return `${hydrated.length} 行 [${hydrated.map((message) => message.kind).join(',')}]`;
    });

    await step('PC 侧预置三条历史会话（走 owner→host 真链路）', async () => {
      const owner = await connectOwner(stack.ownerSocketPath);
      const titles = ['PC 会话 甲', 'PC 会话 乙', 'PC 会话 丙'];
      const created: string[] = [];
      for (const title of titles) {
        const start = await owner.send('thread/start', { cwd: process.cwd(), trusted: true });
        if (!start.success) throw new Error(`owner thread/start 失败: ${String(start.error)}`);
        const threadId = (start.data as { threadId?: string }).threadId ?? '';
        await owner.send('set_session_name', { threadId, name: title });
        await owner.send('prompt', { threadId, message: `${title} 的第一条消息` });
        await sleep(400);
        created.push(threadId);
      }
      // 第一条停掉（parked/dead 形态），第二条停掉，第三条留 live
      await owner.send('thread/stop', { threadId: created[0] as string });
      await owner.send('thread/retire', { threadId: created[1] as string });
      owner.close();
      await sleep(600);
      return `created ${created.join(', ')}`;
    });

    await step('手机端重拉列表（PC 侧会话可见性 + 标题/时间）', async () => {
      const runtime = getRelayRuntime();
      if (runtime === null) throw new Error('runtime missing');
      await loadBootstrap(runtime.client);
      await sleep(400);
      const sessions = useHistoryStore.getState().sessions;
      const rows = sessions.map((session) => `${session.id}|${session.title}|${session.timeLabel}|${session.state}|${session.project}`);
      return `${sessions.length} 行\n    ${rows.join('\n    ')}`;
    });

    await step('手机端打开 PC 侧 parked 会话并续聊（唤活链）', async () => {
      const runtime = getRelayRuntime();
      if (runtime === null) throw new Error('runtime missing');
      const target = useHistoryStore.getState().sessions.find((session) => session.title === 'PC 会话 乙');
      if (target === undefined) throw new Error('历史列表里没有 PC 会话 乙');
      useConversationStore.getState().startNewSession();
      attachThread(target.id);
      await hydrateThread(target.id);
      const hydrated = messages();
      if (hydrated.length === 0) throw new Error('唤活后历史仍为空');
      const prompted = (await runtime.client.invoke('session/prompt', { threadId: target.id, message: '手机端追问' })) as { ok: boolean; error?: { message?: string } };
      if (!prompted.ok) throw new Error(`prompt 失败: ${prompted.error?.message ?? 'unknown'}`);
      await waitFor('手机端追问的回复', () => messages().filter((message) => message.kind === 'assistant').length > hydrated.filter((message) => message.kind === 'assistant').length, 45_000);
      return `水化 ${hydrated.length} 行 → 发送后 ${messages().length} 行`;
    });

    await step('工具调用轮：工具行上屏 + 工具轮收尾', async () => {
      const runtime = getRelayRuntime();
      if (runtime === null) throw new Error('runtime missing');
      const threadId = useConversationStore.getState().activeSessionId ?? useHistoryStore.getState().sessions.find((session) => session.detached !== true)?.id ?? null;
      if (threadId === null) throw new Error('no usable thread');
      const setMode = (await runtime.client.invoke('permission/setMode', { threadId, mode: 'edit-confirm' })) as { ok: boolean; error?: { message?: string } };
      if (!setMode.ok) throw new Error(`setMode 失败: ${setMode.error?.message ?? 'unknown'}`);
      const getMode = (await runtime.client.invoke('permission/mode', { threadId })) as { ok: boolean; data?: { mode?: string } };
      if (getMode.data?.mode !== 'edit-confirm') throw new Error(`权限档未生效: ${JSON.stringify(getMode.data ?? getMode)}`);
      useConversationStore.getState().startNewSession();
      attachThread(threadId);
      await hydrateThread(threadId);
      const prompted = (await runtime.client.invoke('session/prompt', { threadId, message: '跑一个命令' })) as { ok: boolean; error?: { message?: string } };
      if (!prompted.ok) throw new Error(`prompt 失败: ${prompted.error?.message ?? 'unknown'}`);
      await waitFor('工具行上屏', () => messages().some((message) => message.kind === 'tool'), 60_000);
      await waitFor('工具轮收尾', () => messages().some((message) => message.kind === 'assistant' && message.text.includes('tool finished')), 60_000);
      await waitFor('工具行落终态', () => messages().filter((message) => message.kind === 'tool').every((message) => message.status !== 'running'), 30_000);
      const toolRows = messages().filter((message) => message.kind === 'tool');
      const callIds = new Set(toolRows.map((message) => message.id));
      if (callIds.size !== toolRows.length) throw new Error(`同一次工具调用渲染了多行：${toolRows.map((message) => message.id).join(',')}`);
      return `[${messages().map((message) => message.kind).join(',')}] 工具行 ${toolRows.length} 张 status=${toolRows.map((message) => message.status).join('/')} name=${toolRows[0]?.toolName ?? '-'}`;
    });

    await step('脱离宿主表的会话：列表可见但标注不可用', () => {
      const detached = useHistoryStore.getState().sessions.filter((session) => session.detached === true);
      return `${detached.length} 条脱离：${detached.map((session) => `${session.title}(${session.state})`).join(', ') || '无'}`;
    });

    await step('偏好写回（置顶/归档为设备本地偏好）', async () => {
      const target = useHistoryStore.getState().sessions[0];
      if (target === undefined) throw new Error('no session');
      useHistoryStore.getState().togglePinned(target.id);
      await sleep(120);
      const pinned = useHistoryStore.getState().sessions.find((session) => session.id === target.id)?.pinned === true;
      useHistoryStore.getState().togglePinned(target.id);
      return `本地置顶生效=${pinned}`;
    });

    await step('探针：get_models 原始行（contextWindow 是否可得）', async () => {
      const runtime = getRelayRuntime();
      if (runtime === null) throw new Error('runtime missing');
      const models = (await runtime.client.invoke('get_models', {})) as { ok: boolean; data?: unknown };
      const state = (await runtime.client.invoke('get_state', { threadId: useHistoryStore.getState().sessions[0]?.id ?? '' })) as { ok: boolean; data?: unknown };
      const stats = (await runtime.client.invoke('get_session_stats', { threadId: useHistoryStore.getState().sessions[0]?.id ?? '' })) as { ok: boolean; data?: unknown };
      return `models → ${JSON.stringify(models.data ?? models).slice(0, 300)}\n    get_state → ${JSON.stringify(state.data ?? state).slice(0, 200)}\n    stats → ${JSON.stringify(stats.data ?? stats).slice(0, 200)}`;
    });

    await step('探针：parked 态 entries + resume 后的宿主表', async () => {
      const runtime = getRelayRuntime();
      if (runtime === null) throw new Error('runtime missing');
      const owner = await connectOwner(stack.ownerSocketPath);
      const listed = (await runtime.client.invoke('session/liveThreads', {})) as { ok: boolean; data?: { sessions?: unknown } };
      owner.close();
      const raw = listed.data?.sessions;
      const rows = Array.isArray(raw) ? (raw as Array<{ threadId: string; state: string }>) : [];
      const lines: string[] = [`owner thread/list → ${JSON.stringify(raw).slice(0, 300)}`];
      for (const session of useHistoryStore.getState().sessions.slice(0, 4)) {
        const out = (await runtime.client.invoke('session/entries', { threadId: session.id })) as { ok: boolean; data?: { items?: unknown[] }; error?: { message?: string } };
        const inTable = rows.find((row) => row.threadId === session.id)?.state ?? '已移出表';
        const revived = await reviveThread(session.id);
        const after = revived.ok ? ((await runtime.client.invoke('session/entries', { threadId: revived.threadId })) as { ok: boolean; data?: { items?: unknown[] } }) : null;
        lines.push(`设备 ${session.id.slice(-6)}（列表 ${session.state} / 宿主 ${inTable}）entries ok=${out.ok} items=${out.data?.items?.length ?? '-'}${out.error ? ` err=${out.error.message}` : ''} → revive=${revived.ok ? (revived.threadId === session.id ? '原 id' : `换 id ${revived.threadId.slice(-6)}`) : `失败(${revived.reason})`} 再读 ${after === null ? '-' : `${after.ok ? `ok items=${after.data?.items?.length ?? '-'}` : 'fail'}`}`);
      }
      return `\n    ${lines.join('\n    ')}`;
    });

    await step('探针：list_saved 是否覆盖全部会话（含 live）以补标题/时间', async () => {
      const runtime = getRelayRuntime();
      if (runtime === null) throw new Error('runtime missing');
      const live = (await runtime.client.invoke('thread/list', {})) as { ok: boolean; data?: { sessions?: Array<{ threadId: string }> } };
      const saved = (await runtime.client.invoke('thread/list_saved', {})) as { ok: boolean; data?: Array<{ sessionId?: string; title?: string; lastActivityAt?: number }> };
      const liveIds = (live.data?.sessions ?? []).map((row) => row.threadId);
      const savedIds = (saved.data ?? []).map((row) => row.sessionId ?? '');
      const missing = liveIds.filter((id) => !savedIds.includes(id));
      return `live ${liveIds.length} / saved ${savedIds.length} / live 无 saved 副本 ${missing.length} [${missing.join(',')}]`;
    });

    await step('探针：set_model 在真实模型目录下的行为', async () => {
      const runtime = getRelayRuntime();
      if (runtime === null) throw new Error('runtime missing');
      const threadId = useConversationStore.getState().activeSessionId ?? useHistoryStore.getState().sessions[0]?.id;
      if (threadId === undefined || threadId === null) throw new Error('no thread');
      const models = (await runtime.client.invoke('get_models', {})) as { ok: boolean; data?: Array<{ provider: string; modelId: string }> };
      const first = models.data?.[0];
      if (first === undefined) throw new Error('no models');
      const state = (await runtime.client.invoke('session/state', { threadId })) as { ok: boolean; data?: { model?: { provider?: string; model?: string } } };
      const out = (await runtime.client.invoke('session/setModel', { threadId, provider: first.provider, modelId: first.modelId })) as { ok: boolean; error?: unknown };
      return `catalog[0]=${first.provider}/${first.modelId} current=${JSON.stringify(state.data?.model)} setModel ok=${out.ok} ${JSON.stringify(out.error ?? null)}`;
    });

    await step('探针：host 错误码在设备面是否可见', async () => {
      const runtime = getRelayRuntime();
      if (runtime === null) throw new Error('runtime missing');
      const owner = await connectOwner(stack.ownerSocketPath);
      const ownerBad = await owner.send('prompt', { threadId: 'no-such-thread', message: 'x' });
      owner.close();
      const deviceBad = (await runtime.client.invoke('prompt', { threadId: 'no-such-thread', message: 'x' })) as { ok: boolean; error?: unknown };
      const parkedId = useHistoryStore.getState().sessions.find((session) => session.state === 'paused')?.id ?? 'none';
      const deviceParked = (await runtime.client.invoke('prompt', { threadId: parkedId, message: 'x' })) as { ok: boolean; error?: unknown };
      return `owner ${JSON.stringify(ownerBad).slice(0, 160)}\n    设备(坏 thread) ${JSON.stringify(deviceBad).slice(0, 160)}\n    设备(parked) ${JSON.stringify(deviceParked).slice(0, 160)}`;
    });

    await step('探针：其余 UI 消费的命令（tokenAnalytics/file search/权限/模型/改名）', async () => {
      const runtime = getRelayRuntime();
      if (runtime === null) throw new Error('runtime missing');
      const threadId = useConversationStore.getState().activeSessionId ?? useHistoryStore.getState().sessions[0]?.id ?? 'none';
      const probes: Array<[string, string, Record<string, unknown>]> = [
        ['session/tokenAnalytics', 'session/tokenAnalytics', { threadId }],
        ['file/search', 'file/search', { cwd: process.cwd(), query: 'apps' }],
        ['session/setModel', 'session/setModel', { threadId, provider: 'glm', modelId: 'glm-5.3' }],
        ['session/setThinking', 'session/setThinking', { threadId, level: 'high' }],
        ['session/setName', 'session/setName', { threadId, name: '手机改名' }],
        ['permission/setMode', 'permission/setMode', { threadId, mode: 'plan' }],
        ['session/abort', 'session/abort', { threadId }],
        ['session/stats', 'session/stats', { threadId }],
        ['session/state', 'session/state', { threadId }],
      ];
      const lines: string[] = [];
      for (const [label, method, args] of probes) {
        const out = (await runtime.client.invoke(method as never, args)) as { ok: boolean; data?: unknown; error?: unknown };
        const shown = JSON.stringify(out.ok ? out.data ?? null : out.error ?? null);
        lines.push(`${label} ok=${out.ok} ${shown.slice(0, 140)}`);
      }
      return `\n    ${lines.join('\n    ')}`;
    });
  } finally {
    await stack.gatewayShutdown();
    await stack.relayShutdown();
  }

  const failed = checks.filter((check) => !check.ok);
  process.stdout.write(`\n=== ${checks.length - failed.length}/${checks.length} 通过 ===\n`);
  process.exit(failed.length === 0 ? 0 : 1);
}

await main();