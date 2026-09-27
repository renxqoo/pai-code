/**
 * 并行工具批次的组头派生：类别分桶 → 人话标题短语合成 + 批次聚合态。
 *
 * 桶序即短语序（编辑 → 阅读 → 搜索 → 目录 → 命令 → 子智能体 → 未知工具）：固定序让
 * 同一批次的标题在多次渲染间稳定，混合批次读起来是「编辑了文件运行了命令」这样的动宾流水。
 * 标题不带调用计数——执行过程是脚注，标题要短；要看多少次由展开后的调用行承担。
 */

import { copy } from '@/strings';
import { toolKindOf, type ToolKind } from './tool-kind';
import type { ToolCallModel, ToolCallStatus } from './thread-model';

/** 组头类别桶：edit 桶含 edit 与 write（两者都是文件改写，标题统一说「文件」）。 */
export type GroupBucketKind = 'edit' | 'read' | 'search' | 'list' | 'bash' | 'subagent' | 'other';

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

function pushBucket(buckets: Map<GroupBucketKind, ToolGroupBucket>, kind: GroupBucketKind, name: string): void {
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
export function toolGroupBuckets(calls: readonly ToolCallModel[]): readonly ToolGroupBucket[] {
  const buckets = new Map<GroupBucketKind, ToolGroupBucket>();
  for (const call of calls) pushBucket(buckets, bucketOf(call.name), call.name.trim());
  return BUCKET_ORDER.flatMap((kind) => {
    const bucket = buckets.get(kind);
    return bucket === undefined ? [] : [bucket];
  });
}

/** 每个桶的人话短语（不带计数：执行过程是脚注，标题从简）。 */
function bucketPhrase(bucket: ToolGroupBucket): readonly string[] {
  if (bucket.kind === 'bash') return [copy.flow.groupBashPhrase];
  if (bucket.kind === 'list') return [copy.flow.groupListPhrase];
  if (bucket.kind === 'edit') return [copy.flow.groupEditPhrase];
  if (bucket.kind === 'read') return [copy.flow.groupReadPhrase];
  if (bucket.kind === 'search') return [copy.flow.groupSearchPhrase];
  if (bucket.kind === 'subagent') return [copy.flow.groupSubagentPhrase];
  const names = bucket.names.slice(0, MAX_OTHER_NAMES).map((name) => copy.flow.groupOtherPhrase(name));
  if (bucket.names.length > MAX_OTHER_NAMES) names.push(copy.flow.groupMorePhrase);
  return names;
}

/**
 * 并行批次 → 组头标题短语。类别 >3 时取前三并以「等」收口；空批次降级为空串
 * （调用方不渲染组头，标题不参与布局）。
 */
export function toolGroupLabel(calls: readonly ToolCallModel[]): string {
  const phrases = toolGroupBuckets(calls).flatMap(bucketPhrase);
  if (phrases.length === 0) return '';
  const shown = phrases.slice(0, MAX_PHRASES);
  if (phrases.length > MAX_PHRASES) shown.push(copy.flow.groupMorePhrase);
  return copy.flow.groupPhraseJoin(shown);
}

/** 批次聚合态：任一失败 → 失败；任一运行中 → 运行中；任一停止 → 停止；全成功 → 成功。
 * 失败最高优先——批次里只要有一条报错，组级就得是失败色。空批次降级为成功。 */
export function toolGroupStatus(calls: readonly ToolCallModel[]): ToolCallStatus {
  if (calls.some((call) => call.status === 'failed')) return 'failed';
  if (calls.some((call) => call.status === 'running')) return 'running';
  if (calls.some((call) => call.status === 'stopped')) return 'stopped';
  return 'ok';
}

/** 批次是否构成并行分组：单调用不套组头（无并行可言，与单行形态完全一致）。 */
export function toolGroupIsParallel(calls: readonly ToolCallModel[]): boolean {
  return calls.length > 1;
}
