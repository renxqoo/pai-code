import type { GreetingKey } from '@/lib/greeting';
import { baseNameOf } from '@/lib/project-dirs';
import { copy } from '@/strings';

/** 快捷任务胶囊条目：label 展示、prompt 预填（点击只预填，不自动发送）。 */
export type QuickTask = { label: string; prompt: string };

/** 新建任务页问候语（标题 + 副标题）。 */
export function greetingTexts(key: GreetingKey): { title: string; subtitle: string } {
  switch (key) {
    case 'morning':
      return { title: copy.newTask.greetingMorning, subtitle: copy.newTask.subtitleMorning };
    case 'afternoon':
      return { title: copy.newTask.greetingAfternoon, subtitle: copy.newTask.subtitleAfternoon };
    case 'evening':
      return { title: copy.newTask.greetingEvening, subtitle: copy.newTask.subtitleEvening };
    default:
      return { title: copy.newTask.greetingNight, subtitle: copy.newTask.subtitleNight };
  }
}

/** 快捷任务胶囊清单（文案与预填提示词单一真相）。 */
export function quickTaskItems(): readonly QuickTask[] {
  return copy.newTask.quickTasks.map((label) => ({ label, prompt: copy.newTask.quickTaskPrompt(label) }));
}

/** 工作区选择弹窗条目：目录名展示 + 完整路径作次级说明（搜索同时匹配路径）。 */
export function workspaceItems(dirs: readonly string[]): readonly { id: string; label: string; detail: string }[] {
  return dirs.map((cwd) => ({ id: cwd, label: baseNameOf(cwd) || cwd, detail: cwd }));
}
