/**
 * 并行工具批次的组头派生：类别分桶 → 人话标题短语合成 + 批次聚合态。
 *
 * 桶序即短语序（编辑 → 阅读 → 搜索 → 目录 → 命令 → 子智能体 → 未知工具）：固定序让
 * 同一批次的标题在多次渲染间稳定，混合批次读起来是「编辑了文件运行了命令」这样的动宾流水。
 * 标题不带调用计数——执行过程是脚注，标题要短；要看多少次由展开后的调用行承担。
 */

import type { ToolCallStatus } from '@paiapp/contracts';
import type { ToolCopy } from './tool-copy';
import { toolKindOf, type ToolKind } from './tool-kind';
import type { ToolNameRef, ToolStatusRef } from './tool-refs';

/** 组头类别桶：edit 桶含 edit 与 write（两者都是文件改写，标题统一说「文件」）。 */
/** 工具调用桶（动宾流水与计数式两条派生路径共用；不含「思考」——那不是工具调用）。 */
export type GroupBucketKind = 'edit' | 'read' | 'search' | 'list' | 'bash' | 'subagent' | 'other';

/** 计数式标题的桶：在工具桶上加「思考」——思考块不是工具调用，只在这条路径上计数。 */
export type SummaryBucketKind = GroupBucketKind | 'thinking';

/** 计数式标题的输入面：工具调用集合 + 思考块数量（思考不是工具调用，自带计数口径）。 */
export type GroupSummaryInput = {
  readonly calls: readonly ToolNameRef[];
  readonly thinkingCount: number;
};

const BUCKET_BY_KIND: Readonly<Partial<Record<ToolKind, GroupBucketKind>>> = {
  bash: 'bash',
  read: 'read',
  edit: 'edit',
  write: 'edit',
  search: 'search',
  list: 'list',
  subagent: 'subagent',
};

/** 桶序 = 短语序（编辑 → 阅读 → 搜索 → 目录 → 命令 → 子智能体 → 未知工具）：
 * 固定序让同一批次的标题在多次渲染间稳定（与调用到达序无关）。 */
const BUCKET_ORDER: readonly GroupBucketKind[] = ['edit', 'read', 'search', 'list', 'bash', 'subagent', 'other'];
/** 计数式标题的桶序：思考排在编辑之后、阅读之前（与 BUCKET_ORDER 同序，思考插在第二位）。 */
const SUMMARY_BUCKET_ORDER: readonly SummaryBucketKind[] = ['edit', 'thinking', 'read', 'search', 'list', 'bash', 'subagent', 'other'];

/** 短语序 = 桶序；超过此数取前三并以「等」收口（标题不随桶数无界增长）。 */
const MAX_PHRASES = 3;
/** 未知工具列举上限：超出并入「等」。 */
const MAX_OTHER_NAMES = 2;

export type ToolGroupBucket = {
  kind: GroupBucketKind;
  /** 未知工具的原始名（已去重、有序；其余桶为空） */
  names: string[];
};

function bucketOf(name: string): GroupBucketKind {
  return BUCKET_BY_KIND[toolKindOf(name)] ?? 'other';
}

/** 空工具名不进桶：否则组头会拼出悬空的「调用了」（toolRowLabel 已有的裁决，
 *  同一「空名」事实不该两处不同命）。 */
function pushBucket(buckets: Map<GroupBucketKind, ToolGroupBucket>, kind: GroupBucketKind, name: string): void {
  if (name.trim().length === 0) return;
  const existing = buckets.get(kind);
  if (existing === undefined) {
    buckets.set(kind, { kind, names: kind === 'other' ? [name] : [] });
    return;
  }
  if (kind === 'other' && !existing.names.includes(name)) {
    buckets.set(kind, { ...existing, names: [...existing.names, name] });
  }
}

/** 并行批次 → 有序类别桶（按固定桶序，与调用到达序无关）。 */
export function toolGroupBuckets(calls: readonly ToolNameRef[]): readonly ToolGroupBucket[] {
  const buckets = new Map<GroupBucketKind, ToolGroupBucket>();
  for (const call of calls) pushBucket(buckets, bucketOf(call.name), call.name.trim());
  return BUCKET_ORDER.flatMap((kind) => {
    const bucket = buckets.get(kind);
    return bucket === undefined ? [] : [bucket];
  });
}

/** 每个桶的人话短语（不带计数：执行过程是脚注，标题从简）。 */
function bucketPhrase(bucket: ToolGroupBucket, copy: ToolCopy): readonly string[] {
  if (bucket.kind === 'bash') return [copy.groupBashPhrase];
  if (bucket.kind === 'list') return [copy.groupListPhrase];
  if (bucket.kind === 'edit') return [copy.groupEditPhrase];
  if (bucket.kind === 'read') return [copy.groupReadPhrase];
  if (bucket.kind === 'search') return [copy.groupSearchPhrase];
  if (bucket.kind === 'subagent') return [copy.groupSubagentPhrase];
  const names = bucket.names.slice(0, MAX_OTHER_NAMES).map((name) => copy.groupOtherPhrase(name));
  if (bucket.names.length > MAX_OTHER_NAMES) names.push(copy.groupMorePhrase);
  return names;
}

/**
 * 并行批次 → 组头标题短语。收口按**桶数**（用户规格：「>3 类以等收口」，
 * 按短语数算会让 `other` 一个类别出多条短语时两类也被收口）；
 * 桶序固定（编辑 → 阅读 → 搜索 → 目录 → 命令 → 子智能体 → 未知），
 * 同一批次多次渲染标题稳定。
 *
 * **命令类保底**：命令是唯一有副作用的类别（其余只读本地），桶序又把它排在
 * 倒数第二，前 N 截断会系统性吃掉它（批次里跑了命令，标题里却没有命令）。
 * 所以收口时给它留位：若它不在入选的前 N 条内，替换掉最后一条。
 *
 * 空批次降级为空串（调用方不渲染组头，标题不参与布局）。
 */
/**
 * 整轮过程组的计数式标题（动宾流水版的计数形态）：「编辑 3 个文件, 思考 2 次, 执行 1 条命令」。
 *
 * 与 `toolGroupLabel` 的三处结构差异：
 * 1. **计数入标题**——动宾流水刻意不带计数（「等」把数量吞了，用户分不出 3 个还是 30 个）；
 *    计数式与 `turnChangedFiles`（· 改了 3 个文件）同一语感。
 * 2. **思考是独立桶**——思考块不是工具调用（不进子行），但它有自己的计数口径，
 *    排在编辑之后、阅读之前。
 * 3. **连接用逗号**——`groupCountJoin` 注入（中文 `, `，英文 `, `）；
 *    动宾流水版的中文是直拼（`groupPhraseJoin`），两者不共用。
 *
 * 桶序固定（与到达序无关）：编辑 → 思考 → 阅读 → 搜索 → 目录 → 命令 → 子智能体 → 未知。
 * 收口按**桶数**（同动宾流水版），命令桶保底——命令是唯一有副作用的类别，桶序又把它排在
 * 倒数第二，前 N 截断会系统性吃掉它。
 *
 * 空输入（无调用且无思考）降级为空串：调用方据此不渲染组头，标题不参与布局。
 */
export function toolGroupSummary(input: GroupSummaryInput, copy: ToolCopy): string {
  const buckets = new Map<SummaryBucketKind, number>();
  if (input.thinkingCount > 0) buckets.set('thinking', input.thinkingCount);
  for (const call of input.calls) {
    const kind = bucketOf(call.name);
    // 未知工具桶需要点名，按工具名分别计数；其余桶累加
    if (kind === 'other') {
      buckets.set('other', (buckets.get('other') ?? 0) + 1);
      continue;
    }
    buckets.set(kind, (buckets.get(kind) ?? 0) + 1);
  }
  const ordered = SUMMARY_BUCKET_ORDER.flatMap((kind) => {
    const count = buckets.get(kind);
    return count === undefined ? [] : [{ kind, count }];
  });
  if (ordered.length === 0) return '';
  if (ordered.length <= MAX_PHRASES) return copy.groupCountJoin(ordered.map((entry) => countedPhrase(entry, input.calls, copy)));

  const shown = ordered.slice(0, MAX_PHRASES);
  const hasBash = ordered.some((entry) => entry.kind === 'bash');
  if (hasBash && !shown.some((entry) => entry.kind === 'bash')) {
    const bashEntry = ordered.find((entry) => entry.kind === 'bash');
    if (bashEntry !== undefined) shown[MAX_PHRASES - 1] = bashEntry;
  }
  // 不追加「等」：计数标题的读者要的是规模，收口词是纯噪音（动宾流水版 toolGroupLabel
  // 仍保留「等」——那里它替代的是「还有别的类别」这层语义，本行用计数已经说清了）。
  return copy.groupCountJoin(shown.map((entry) => countedPhrase(entry, input.calls, copy)));
}

/** 单桶 → 计数短语。未知桶取首个工具名点名（超过列举上限的语义由调用方按「等」收口承担）。 */
function countedPhrase(entry: { kind: SummaryBucketKind; count: number }, calls: readonly ToolNameRef[], copy: ToolCopy): string {
  switch (entry.kind) {
    case 'edit':
      return copy.groupCountEdit(entry.count);
    case 'thinking':
      return copy.groupCountThinking(entry.count);
    case 'read':
      return copy.groupCountRead(entry.count);
    case 'search':
      return copy.groupCountSearch(entry.count);
    case 'list':
      return copy.groupCountList(entry.count);
    case 'bash':
      return copy.groupCountBash(entry.count);
    case 'subagent':
      return copy.groupCountSubagent(entry.count);
    case 'other': {
      const first = calls.find((call) => bucketOf(call.name) === 'other');
      const name = first?.name.trim() ?? '';
      return name.length > 0 ? copy.groupCountOther(entry.count, name) : copy.groupCountOther(entry.count, '');
    }
  }
}

export function toolGroupLabel(calls: readonly ToolNameRef[], copy: ToolCopy): string {
  const buckets = toolGroupBuckets(calls);
  const phrases = buckets.flatMap((bucket) => bucketPhrase(bucket, copy));
  if (phrases.length === 0) return '';
  if (buckets.length <= MAX_PHRASES) return copy.groupPhraseJoin(phrases);

  // 桶级收口：前 N 个桶的短语全留，其余桶折成「等」；命令桶保底
  const shownBuckets = buckets.slice(0, MAX_PHRASES);
  const restCount = buckets.length - shownBuckets.length;
  const hasBash = buckets.some((bucket) => bucket.kind === 'bash');
  const bashInShown = shownBuckets.some((bucket) => bucket.kind === 'bash');
  if (hasBash && !bashInShown) {
    const bashBucket = buckets.find((bucket) => bucket.kind === 'bash');
    if (bashBucket !== undefined) shownBuckets[MAX_PHRASES - 1] = bashBucket;
  }

  const shown = shownBuckets.flatMap((bucket) => bucketPhrase(bucket, copy));
  // 「等」覆盖的桶数变了，文案要跟着变（按短语数报数量会对不上）
  return copy.groupPhraseJoin(restCount > 0 ? [...shown, copy.groupMorePhrase] : shown);
}

/** 批次聚合态：任一失败 → 失败；任一运行中 → 运行中；任一停止 → 停止；全成功 → 成功。
 * 失败最高优先——批次里只要有一条报错，组级就得是失败色。空批次降级为成功。 */
export function toolGroupStatus(calls: readonly ToolStatusRef[]): ToolCallStatus {
  if (calls.some((call) => call.status === 'failed')) return 'failed';
  if (calls.some((call) => call.status === 'running')) return 'running';
  if (calls.some((call) => call.status === 'stopped')) return 'stopped';
  return 'ok';
}

/** 批次是否构成并行分组：单调用不套组头（无并行可言，与单行形态完全一致）。 */
export function toolGroupIsParallel(calls: readonly ToolNameRef[]): boolean {
  return calls.length > 1;
}
