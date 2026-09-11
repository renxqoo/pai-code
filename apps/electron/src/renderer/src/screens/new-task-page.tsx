import * as React from 'react';

import { useNewTaskScreen } from '@/screens/use-new-task-screen';
import { NewTaskScreen } from '@/screens/new-task-screen';

/**
 * 新建任务页包装（T34 M3）：装配 hook 的订阅随本页挂卸（knownDirs/models 等不进
 * 工作区订阅面）；key 重挂载语义保留（重复进入重置页内状态）。
 */
function NewTaskPage({ enterCwd }: { enterCwd: string }): React.JSX.Element {
  const screen = useNewTaskScreen(enterCwd);
  return <NewTaskScreen {...screen} />;
}

const NewTaskPageMemo = React.memo(NewTaskPage);
export { NewTaskPageMemo as NewTaskPage };
