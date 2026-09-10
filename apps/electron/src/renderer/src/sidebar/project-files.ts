import { workspaceActions } from '@/live/workspace-runtime';
import { buildFileTree } from '@/sidebar/build-file-tree';
import { uiStore } from '@/ui/ui-store';

type ListProjectFiles = (cwd: string) => Promise<string[] | null>;

/**
 * 项目文件面板编排（控制器，T18）：目标项目、文件树、加载态全在 ui store，
 * 本模块只做异步装配——请求按代次防竞态（迟到的旧项目响应不得覆盖新目标），
 * 关闭即复位（target 归 null，后续在途响应因面板已关而无害）。
 */

let lister: ListProjectFiles = (cwd) => workspaceActions.listProjectFiles(cwd);

/** 装配注入 / 测试换装（引用保持稳定，不在调用点建闭包）。 */
export function installProjectFilesLister(next: ListProjectFiles): void {
  lister = next;
}

let epoch = 0;

/** 打开面板（先收侧栏搜索由调用方负责——面板自带搜索框）。 */
export function openProjectFiles(cwd: string, displayName: string): void {
  epoch += 1;
  const current = epoch;
  uiStore.getState().beginProjectFiles({ name: displayName, path: cwd });
  void lister(cwd).then((paths) => {
    if (epoch !== current) return;
    uiStore.getState().completeProjectFiles(buildFileTree(paths ?? []));
  });
}

export function closeProjectFiles(): void {
  uiStore.getState().closeProjectFiles();
}
