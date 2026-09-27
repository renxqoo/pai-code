/**
 * 工具行摘要派生（文案为主）：argsPreview 可能是完整命令串、shell 链或绝对路径，
 * 列表行只显示人话摘要（动作 + 对象名），完整内容在展开详情。
 * 三条硬规则：不透出绝对路径/目录前缀、不透出 shell 标志与数值参数、不透出命令链。
 * 外加两条展示面硬规则：摘要是**一行**，且只描述「对什么做了什么」——
 * 参数值（`bash -c` 的脚本、`grep` 的正则、heredoc 正文）原样截断后
 * 塞进行内会变成几百字正文，一行根本读不完，也不该在这里读。
 */

const SHELL_OPERATORS = /\s*(?:&&|\|\||;|\||>|<)\s*/;
const CHANGE_DIR_VERBS = new Set(['cd', 'export', 'set']);
const FLAG = /^-/;
const NUMERIC_ARG = /^[0-9]+(?:[,:][0-9]*)*p?$/;

/** 摘要字符上限：超出的词丢弃（不是截断加省略号——省略号会被读成「还有下文」，
 * 而摘要的语义本就是「只取动作与对象」，丢掉后面的词才是对的）。 */
const MAX_SUMMARY_CHARS = 60;

/**
 * 对象名长度上限：按**文件名**（剥掉目录后）判，不是原始 token——
 * `packages/api/src/views/__test__/entries-mapper-edit-hunks.test.ts`
 * 整串 60+ 字符，但它的对象名 `entries-mapper-edit-hunks.test.ts`（33）
 * 完全是正常文件名，按整串长度卡会把这类路径全滤光，只剩动词。
 * 40 容纳带连字符的长测试名，又不至于让散文混进来。
 */
const MAX_NAME_CHARS = 40;

/**
 * 「散文」判据：靠标点密度与 CJK，而不是字符数。
 * 之前用 `.{28,}` 当长句特征，结果把 `entries-mapper-edit-hunks.test.ts`
 * 这类正常长文件名一并滤光（33 字符的连字符测试名是常态）。
 * 真正的散文必带标点空格或中日韩字，且文件名不会有。
 */
const PROSE = /[，。；：？！、（）【】《》“”‘’\n\r]|[一-鿿぀-ヿ]|^(?:[a-z]+\s+){4,}/i;

/**
 * 整段脚本 flag：它们吃掉的下一个 token 是完整脚本/代码，那不是「对象名」
 * 而是参数值——后面的词全部属于它，一并丢掉。
 * 判据必须是**动词 + flag 组合**（bash -c / node -e），只看 flag 字母会
 * 误伤 `sed -e` 这类只吃单个短参的情形。
 */
const SCRIPT_PAIRS: Readonly<Record<string, ReadonlySet<string>>> = {
  bash: new Set(['-c']),
  sh: new Set(['-c']),
  zsh: new Set(['-c']),
  node: new Set(['-e', '-E', '-p']),
  bun: new Set(['-e']),
  python: new Set(['-c']),
  python3: new Set(['-c']),
};

/** shell 注释与 heredoc 正文标记：后面的内容全是笔记/散文，不是对象名。 */
const COMMENT_MARK = /^[#/]/;

function stripQuotes(token: string): string {
  return token.replace(/^["'`]+|["'`]+$/g, '');
}

/** 路径化 token 归一为对象名：`apps/mobile/src/strings/zh.ts` → `zh.ts`。 */
function objectName(token: string): string {
  const clean = stripQuotes(token);
  const segments = clean.split(/[\\/]/);
  return segments.at(-1) ?? clean;
}

function tokenize(segment: string): string[] {
  return segment.trim().split(/\s+/).map(stripQuotes).filter((token) => token.length > 0);
}

/**
 * 对象位收窄：只留「像对象名」的词（命令名/文件名/包名/标识符）。
 * 长句、CJK 正文、含标点的散文一律丢弃——它们是参数值或正文，
 * 该去详情区看，不该占着一行摘要的位置。
 */
function isObjectish(token: string): boolean {
  if (token.length === 0 || token.length > MAX_NAME_CHARS) return false;
  if (PROSE.test(token)) return false;
  if (COMMENT_MARK.test(token)) return false;
  return true;
}

/**
 * 人话摘要：命令链取首个实质段（跳过 cd/export），剥路径前缀、丢 flag 与数值参数，
 * 保留动词与对象词干；只留能当「对象」的词，整体封顶一行。
 * 垃圾输入安全降级空串。
 */
export function toolSummary(argsPreview: string): string {
  const raw = argsPreview.trim();
  if (raw.length === 0) return '';
  // 整段引号短语（如任务描述）原样保留，不再拆词。
  const quoted = raw.match(/^["'`](.*)["'`]$/s);
  if (quoted?.[1] !== undefined && quoted[1].trim().length > 0) {
    return clipSummary(quoted[1].trim());
  }
  const segments = raw.split(SHELL_OPERATORS).filter((part) => part.trim().length > 0);
  const primaryIndex = segments.findIndex((part) => {
    const verb = stripQuotes(part.trim().split(/\s+/)[0] ?? '');
    return !CHANGE_DIR_VERBS.has(verb);
  });
  const primary = segments[primaryIndex] ?? segments[0] ?? '';
  const words = objectWords(tokenize(primary));
  return clipSummary(words.join(' '));
}

/** token → 对象词：越过第一个「动词+脚本flag」组合后全部丢弃，其余按对象名规则过滤。 */
function objectWords(tokens: readonly string[]): string[] {
  const scriptFlags = SCRIPT_PAIRS[stripQuotes(tokens[0] ?? '')] ?? null;
  const out: string[] = [];
  for (const token of tokens) {
    if (scriptFlags?.has(token) === true) break;
    if (FLAG.test(token)) continue;
    if (NUMERIC_ARG.test(token)) continue;
    // 先归一为对象名（剥目录前缀）再判合格——顺序反了会把
    // `apps/…/timeline-list.tsx` 这类长路径在剥前缀前就当噪声丢掉
    const name = objectName(token);
    if (out.length > 0 && !isObjectish(name)) continue;
    out.push(name);
  }
  return out;
}

/** 封顶一行：超长时只留动词（动作是摘要的主体，对象可有可无）。 */
function clipSummary(text: string): string {
  if (text.length <= MAX_SUMMARY_CHARS) return text;
  const verb = text.split(' ')[0] ?? '';
  return verb;
}
