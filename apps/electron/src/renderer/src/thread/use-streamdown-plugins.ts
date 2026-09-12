import { useEffect, useMemo, useState } from 'react';
import { cjk } from '@streamdown/cjk';
import type { DiagramPlugin, MathPlugin, PluginConfig } from 'streamdown';

import { codePlugin } from './shiki-code-plugin';

/**
 * streamdown 插件表：code/cjk 同步装配，重插件按需动态加载后并入（未就绪时降级为
 * 普通代码块/纯文本渲染）——mermaid 仅在文本出现 mermaid 围栏时加载（体积 >1MB），
 * math 仅在文本含 $$ 定界时加载（katex 体积大，无公式会话不支付该成本）。
 * 检测由 markdown-stream-cache 的 append-only 闩锁供给（只扫增量，不全文重扫）。
 */
function useStreamdownPlugins(needsMath: boolean, needsMermaid: boolean): PluginConfig {
  const [mermaid, setMermaid] = useState<DiagramPlugin | null>(null);
  const [math, setMath] = useState<MathPlugin | null>(null);

  useEffect(() => {
    if (!needsMermaid) return;
    let mounted = true;
    void import('@streamdown/mermaid').then((module) => {
      if (mounted) setMermaid(module.mermaid);
    });
    return () => {
      mounted = false;
    };
  }, [needsMermaid]);

  useEffect(() => {
    if (!needsMath) return;
    let mounted = true;
    void import('@streamdown/math').then((module) => {
      if (mounted) setMath(module.math);
    });
    return () => {
      mounted = false;
    };
  }, [needsMath]);

  return useMemo(() => {
    const plugins: PluginConfig = { code: codePlugin, cjk };
    if (math !== null) plugins.math = math;
    if (mermaid !== null) plugins.mermaid = mermaid;
    return plugins;
  }, [math, mermaid]);
}

export { useStreamdownPlugins };
