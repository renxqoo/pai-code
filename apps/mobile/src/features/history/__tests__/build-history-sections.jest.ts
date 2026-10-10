import { describe, expect, it } from '@jest/globals';

import { SHOW_MORE_LIMIT, buildHistorySections, projectNameOf } from '@/features/history/build-history-sections';
import { testSession } from '@/test/session-fixture';

const at = (minutesAgo: number): number => 1_700_000_000_000 - minutesAgo * 60_000;
const NO_FOLD: ReadonlySet<string> = new Set<string>();

const build = (sessions: Parameters<typeof buildHistorySections>[0], query = '', collapsed: ReadonlySet<string> = NO_FOLD, expanded: ReadonlySet<string> = NO_FOLD) => buildHistorySections(sessions, query, collapsed, expanded);

describe('build-history-sections', () => {
  it('groups by working directory and never merges同名不同目录', () => {
    const sections = build([
      testSession('a', { project: '/work/alpha', startedAtMs: at(10) }),
      testSession('b', { project: '/work/beta/alpha', startedAtMs: at(5) }),
      testSession('c', { project: '/work/alpha', startedAtMs: at(1) }),
    ]);
    expect(sections.map((section) => section.key)).toEqual(['/work/alpha', '/work/beta/alpha']);
    expect(sections.map((section) => section.title)).toEqual(['alpha', 'alpha']);
    expect(sections.map((section) => section.total)).toEqual([2, 1]);
  });

  it('sorts by activity inside a group and by latest activity across groups', () => {
    const sections = build([
      testSession('older', { project: '/work/alpha', startedAtMs: at(30) }),
      testSession('newest', { project: '/work/alpha', startedAtMs: at(1) }),
      testSession('mid', { project: '/work/alpha', startedAtMs: at(15) }),
      testSession('other', { project: '/work/beta', startedAtMs: at(20) }),
    ]);
    expect(sections[0]?.key).toBe('/work/alpha');
    expect(sections[0]?.data.map((session) => session.id)).toEqual(['newest', 'mid', 'older']);
    expect(sections[1]?.key).toBe('/work/beta');
    expect(sections[0]?.latestActivityAt).toBe(at(1));
  });

  it('caps a group at the show-more limit until it is expanded（组内 7 条先给 5 条 + 2 条待展开）', () => {
    const many = Array.from({ length: 7 }, (_, index) => testSession(`s${index}`, { project: '/work/alpha', startedAtMs: at(index) }));
    const capped = build(many);
    expect(capped[0]?.total).toBe(7);
    expect(capped[0]?.data).toHaveLength(SHOW_MORE_LIMIT);
    expect(capped[0]?.expanded).toBe(false);
    const expanded = build(many, '', NO_FOLD, new Set(['/work/alpha']));
    expect(expanded[0]?.data).toHaveLength(7);
  });

  it('folds a whole group away while keeping the real count（折叠组组内无行、总数不变）', () => {
    const sections = build(
      [testSession('a', { project: '/work/alpha' }), testSession('b', { project: '/work/alpha' })],
      '',
      new Set(['/work/alpha']),
    );
    expect(sections[0]?.data).toEqual([]);
    expect(sections[0]?.total).toBe(2);
    expect(sections[0]?.collapsed).toBe(true);
  });

  it('keeps pinned sessions in their own leading section', () => {
    const sections = build([
      testSession('pinned', { pinned: true, project: '/work/alpha', startedAtMs: at(99) }),
      testSession('plain', { project: '/work/alpha', startedAtMs: at(1) }),
    ]);
    expect(sections.map((section) => section.kind)).toEqual(['pinned', 'project']);
    expect(sections[0]?.data.map((session) => session.id)).toEqual(['pinned']);
    expect(sections[1]?.data.map((session) => session.id)).toEqual(['plain']);
  });

  it('hides archived sessions unless searching（归档对话无查询时隐藏、搜索时并入）', () => {
    const sessions = [testSession('archived', { archived: true, project: '/work/alpha', title: '归档的对话' }), testSession('live', { project: '/work/alpha' })];
    expect(build(sessions)[0]?.data.map((session) => session.id)).toEqual(['live']);
    expect(build(sessions, '归档的对话')[0]?.data.map((session) => session.id)).toEqual(['archived']);
  });

  it('matches the query against title, preview and project path', () => {
    const sessions = [
      testSession('by-title', { title: '重构时间线', project: '/work/alpha' }),
      testSession('by-preview', { preview: '带 usage 数字的摘要', project: '/work/beta' }),
      testSession('by-path', { project: '/work/gamma' }),
    ];
    expect(build(sessions, '重构')[0]?.data.map((session) => session.id)).toEqual(['by-title']);
    expect(build(sessions, 'usage')[0]?.data.map((session) => session.id)).toEqual(['by-preview']);
    expect(build(sessions, '/work/gamma')[0]?.data.map((session) => session.id)).toEqual(['by-path']);
  });

  it('leaves the display name empty for sessions without a working directory', () => {
    expect(projectNameOf('/work/alpha/')).toBe('alpha');
    expect(projectNameOf('')).toBe('');
    const sections = build([testSession('loose', { project: '' })]);
    expect(sections[0]?.title).toBe('');
    expect(sections[0]?.key).toBe('');
  });

  it('does not mutate the incoming session order', () => {
    const sessions = [testSession('old', { startedAtMs: at(9) }), testSession('new', { startedAtMs: at(1) })];
    build(sessions);
    expect(sessions.map((session) => session.id)).toEqual(['old', 'new']);
  });

  it('clamps a non-positive limit to an empty group', () => {
    expect(buildHistorySections([testSession('a', { project: '/work/alpha' })], '', NO_FOLD, NO_FOLD, -1)[0]?.data).toEqual([]);
  });
});