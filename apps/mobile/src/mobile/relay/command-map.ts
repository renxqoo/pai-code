/**
 * 命令词表翻译（T58 R1 H2/H4 修复）：手机 App 的 ApiMethod（contracts/api.ts——
 * 桌面端 hub 词表）→ x-harness gateway host 命令（remote-protocol/vocab.ts 全集：
 * thread/* prompt steer follow_up abort compact get_state get_inflight get_messages
 * get_entries get_tree get_session_stats get_commands get_fork_messages
 * set_session_name get_subagents get_pending_dialogs fork clone get_models set_model
 * set_model_override bash abort_bash ui_response models/* auth/* agents/* skills/*
 * settings/get settings/set set_thinking_level get_thinking_level permission/* …）。
 * 两套词表因历史演进分叉；本表是移动端 relay 链路的唯一翻译层（参数名随命令一并对拍）。
 * 未映射的 ApiMethod 原样透传 → gateway 判 unknown-command fail-closed（安全面不变）。
 *
 * dialog/respond 与 dialog/pickDirectory 是特殊面：respond 走 L2 ui_response 帧
 * （gateway inbound 专用面，非命令）；pickDirectory 仅桌面端有（移动端不可达）。
 */

/** ApiMethod → host 命令映射（args 键改名 + 值变换） */
interface CommandMapping {
  host: string;
  /** ApiMethod args 键 → host 参数键（未列出的键丢弃） */
  args?: Record<string, string>;
  /** 完整参数构造（与 args 合并，transform 优先） */
  transform?: (args: Record<string, unknown>) => Record<string, unknown>;
}

const COMMAND_MAP: Record<string, CommandMapping> = {
  'session/start': {
    host: 'thread/start',
    transform: (args) => {
      const out: Record<string, unknown> = {};
      if (typeof args['cwd'] === 'string') out['cwd'] = args['cwd'];
      if (args['trusted'] === true) out['trust'] = 'trusted';
      return out;
    },
  },
  'session/resume': { host: 'thread/resume', args: { threadId: 'threadId' } },
  'session/prompt': {
    host: 'prompt',
    transform: (args) => {
      const out: Record<string, unknown> = {};
      if (typeof args['threadId'] === 'string') out['threadId'] = args['threadId'];
      const text = args['message'] ?? args['text'];
      if (typeof text === 'string') out['text'] = text;
      return out;
    },
  },
  'session/abort': { host: 'abort', args: { threadId: 'threadId' } },
  'session/entries': { host: 'get_entries', args: { threadId: 'threadId', since: 'since' } },
  'session/messages': { host: 'get_messages', args: { threadId: 'threadId' } },
  'session/list': { host: 'thread/list' },
  'session/listSaved': { host: 'thread/list_saved' },
  'session/setName': { host: 'set_session_name', args: { threadId: 'threadId', name: 'name' } },
  'session/stop': {
    host: 'thread/stop',
    transform: (args) => {
      const out: Record<string, unknown> = { threadId: args['threadId'] };
      if (args['remove'] === true) out['remove'] = true;
      return out;
    },
  },
  'session/setModel': {
    host: 'set_model',
    transform: (args) => ({ threadId: args['threadId'], provider: args['provider'], modelId: args['modelId'] }),
  },
  'session/setThinking': { host: 'set_thinking_level', args: { threadId: 'threadId', level: 'level' } },
  'session/thinkingLevel': { host: 'get_thinking_level', args: { threadId: 'threadId' } },
  'session/stats': { host: 'get_session_stats', args: { threadId: 'threadId' } },
  'session/state': { host: 'get_state', args: { threadId: 'threadId' } },
  'session/inflight': { host: 'get_inflight', args: { threadId: 'threadId' } },
  'session/fork': { host: 'fork', args: { threadId: 'threadId' } },
  'model/list': { host: 'get_models' },
  'permission/mode': { host: 'permission/get_mode', args: { threadId: 'threadId' } },
  'permission/setMode': { host: 'permission/set_mode', args: { threadId: 'threadId', mode: 'mode' } },
  'agents/list': { host: 'agents/list' },
  'skills/list': { host: 'skills/list' },
};

/** ApiMethod → gateway host 命令 + 参数翻译。 */
export function translateCommand(method: string, args: Record<string, unknown>): { command: string; args: Record<string, unknown> } {
  const mapping = COMMAND_MAP[method];
  if (mapping === undefined) return { command: method, args };
  const renamed: Record<string, unknown> = {};
  for (const [fromKey, toKey] of Object.entries(mapping.args ?? {})) {
    if (args[fromKey] !== undefined) renamed[toKey] = args[fromKey];
  }
  const transformed = mapping.transform !== undefined ? mapping.transform(args) : {};
  return { command: mapping.host, args: { ...renamed, ...transformed } };
}

/** host response data → ApiData（当前字段形状兼容直通；出现差异时在此扩展）。 */
export function mapResponseData(_host: string, data: unknown): unknown {
  return data;
}
