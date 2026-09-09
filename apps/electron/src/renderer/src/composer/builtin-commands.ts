/**
 * 内置斜杠命令注册表（渲染层命令目录的本地合成面，单一真相）：
 * hub 的 get_commands 目录只含 extension/prompt/skill 三源——客户端本地命令
 * （如 /compact：pi 的 TUI 内置命令不入目录、hub prompt 通路也不拦截，唯一
 * 有效入口是 session/compact 协议命令）在此以 'builtin' 源注册，经
 * mergeCommands 合成进目录后，补全弹层、首 token 高亮、原子删除按既有
 * 目录机制自动生效；提交侧的分派消费 parseBuiltinCommand 的命中结果。
 */

import type { CommandView } from '@paiapp/contracts';

import { copy } from '@/strings';

/** 内置命令名封闭集：注册表新条目在此扩展——submit-draft 的分派 switch 借它获得
 * 编译期穷尽锁（漏接新命令时 default 分支的 never 断言先红）。 */
export type BuiltinCommandName = 'compact';

/** 本地内置命令（不过 IPC；description 走本地化文案目录）。 */
export type BuiltinCommand = {
  name: BuiltinCommandName
  description: string | null
  source: 'builtin'
}

/** 命令目录消费面统一类型：hub 三源条目 + 本地内置条目。 */
export type ComposerCommand = CommandView | BuiltinCommand

function builtinCommands(): readonly BuiltinCommand[] {
  return [{ name: 'compact', description: copy.composer.builtinCompactDescription, source: 'builtin' }];
}

/** 合成命令目录：内置条目前置；hub 目录出现同名命令时本地条目让位（目录真相在 hub）。
 * 让位只覆盖目录展示面——提交拦截仍由本地注册表判定（当前语义等价：同名即压缩）；
 * hub 目录真出现同名命令之日需重新裁决拦截面是否同步让位。 */
export function mergeCommands(hubCommands: readonly CommandView[]): readonly ComposerCommand[] {
  const hubNames = new Set(hubCommands.map((command) => command.name));
  return [...builtinCommands().filter((command) => !hubNames.has(command.name)), ...hubCommands];
}

/**
 * 解析提交文本的首 token 是否内置命令（原始文本、严格行首——与命令高亮及
 * pi 的 startsWith("/") 解释词法一致，前导空白不命中）：
 * 命中条件 = 首 token 与命令名精确匹配（`/compact` 后跟空白或结尾，`/compactfoo`
 * 不劫持）；rest = 后随文本（trim 首尾、内部空白原样，可空串）。
 * 未命中返回 null（照常走消息提交）。
 */
export function parseBuiltinCommand(text: string): { name: BuiltinCommandName; rest: string } | null {
  for (const command of builtinCommands()) {
    const prefix = `/${command.name}`;
    const next = text[prefix.length] ?? '';
    if (text === prefix || (text.startsWith(prefix) && /\s/.test(next))) {
      return { name: command.name, rest: text.slice(prefix.length).trim() };
    }
  }
  return null;
}
