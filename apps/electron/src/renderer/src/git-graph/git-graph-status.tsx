import { Spinner } from '@paiapp/ui';

import { copy } from '@/strings';

type GraphBodyStatus = 'loading' | 'unavailable' | 'empty';

/** 表体非就绪态视图：加载（转圈 + 文案）/ 加载失败 / 空仓库，居中弱化呈现。 */
function GitGraphBodyStatus({ status }: { status: GraphBodyStatus }) {
  const text =
    status === 'loading'
      ? copy.gitGraph.loading
      : status === 'unavailable'
        ? copy.gitGraph.unavailable
        : copy.gitGraph.empty;
  return (
    <div className="grid flex-1 place-items-center px-6 py-10">
      <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
        {status === 'loading' && <Spinner label={text} className="size-4" />}
        <p>{text}</p>
      </div>
    </div>
  );
}

export { GitGraphBodyStatus };
export type { GraphBodyStatus };
