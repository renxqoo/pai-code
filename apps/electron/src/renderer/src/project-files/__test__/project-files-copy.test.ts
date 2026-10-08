import { describe, expect, test } from 'bun:test';

import { copy } from '@/strings';

/**
 * 文案域归属快照：project-files 面板的专属文案归 `copy.projectFiles` 域
 * （此前误挂 `copy.sidebar` 下——面板是侧栏内嵌层但文案域按消费者划分，
 * 侧栏域只留侧栏壳消费的 key）。用例锁「域搬家后旧位不得复活」。
 */
describe('projectFiles 文案域归属', () => {
  test('面板专属文案在 projectFiles 域：close/loading/empty', () => {
    expect(copy.projectFiles.close).toBe('关闭');
    expect(copy.projectFiles.loading).toBe('正在读取项目文件…');
    expect(copy.projectFiles.empty).toBe('没有可展示的文件');
  });

  test('sidebar 域不再携带面板专属 key（搬家后旧位不得复活）', () => {
    const sidebar = copy.sidebar as Record<string, unknown>;
    expect(sidebar.closeProjectFiles).toBeUndefined();
    expect(sidebar.projectFilesLoading).toBeUndefined();
    expect(sidebar.projectFilesEmpty).toBeUndefined();
  });
});
