import * as React from 'react';
import { Text, View } from 'react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius, spacing } from '@/theme/tokens';
import { useDemoModeStore } from '@/store/demo-mode-store';
import { getBridge, useBridgeStatus } from '@/mobile/relay/runtime';
import { useConversationStore } from '@/store/conversation-store';

const demoUsage = [
  { label: 'GPT-5.2 Codex', percent: 62, value: '79.6K' },
  { label: 'Claude Sonnet 5', percent: 24, value: '30.8K' },
  { label: 'Gemini 3 Pro', percent: 14, value: '18.0K' },
] as const;

interface UsageRow {
  label: string;
  percent: number;
  value: string;
}

/** 活跃会话的 token 分析（session/tokenAnalytics：used/window 构成占比）。 */
export function UsageCard() {
  const { colors } = useAppTheme();
  const demo = useDemoModeStore((state) => state.enabled);
  const { status } = useBridgeStatus();
  const [rows, setRows] = React.useState<readonly UsageRow[] | null>(null);

  React.useEffect(() => {
    if (demo || status !== 'ready') return;
    const bridge = getBridge();
    if (bridge === null) return;
    const threadId = useConversationStore.getState().activeSessionId;
    if (threadId === null) {
      setRows([]);
      return;
    }
    void bridge.client.invoke('session/tokenAnalytics', { threadId }).then((outcome: unknown) => {
      // 无活跃 threadId 的 invoke 会失败——空形态即可（usage 页有会话才有数据）
      const data = outcome as { ok: boolean; data?: Record<string, unknown> };
      if (!data.ok || data.data === undefined) {
        setRows([]);
        return;
      }
      const used = typeof data.data['used'] === 'number' ? (data.data['used'] as number) : 0;
      const window = typeof data.data['window'] === 'number' ? (data.data['window'] as number) : 0;
      const messages = typeof data.data['messages'] === 'number' ? (data.data['messages'] as number) : 0;
      const system = typeof data.data['systemPrompt'] === 'number' ? (data.data['systemPrompt'] as number) : 0;
      const tools = typeof data.data['tools'] === 'number' ? (data.data['tools'] as number) : 0;
      const rowsOut: UsageRow[] = [];
      if (window > 0) {
        rowsOut.push({ label: '上下文占用', percent: Math.min(100, Math.round((used / window) * 100)), value: formatTokens(used) });
        if (messages > 0) rowsOut.push({ label: '消息', percent: Math.min(100, Math.round((messages / window) * 100)), value: formatTokens(messages) });
        if (system > 0) rowsOut.push({ label: '系统提示', percent: Math.min(100, Math.round((system / window) * 100)), value: formatTokens(system) });
        if (tools > 0) rowsOut.push({ label: '工具', percent: Math.min(100, Math.round((tools / window) * 100)), value: formatTokens(tools) });
      }
      setRows(rowsOut);
    });
  }, [demo, status]);

  const list: readonly UsageRow[] = demo ? demoUsage : (rows ?? []);

  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 24, padding: spacing.xs4, shadowColor: '#3F3F46', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.07, shadowRadius: 22, elevation: 3 }}>
      {list.length === 0 ? <Text style={{ color: colors.textMuted, fontSize: 13, paddingVertical: 10 }}>连接电脑并打开一个会话后显示用量。</Text> : null}
      {list.map((item, index) => (
        <View key={item.label} style={{ borderTopColor: colors.divider, borderTopWidth: index === 0 ? 0 : 1, paddingVertical: 13 }}>
          <View style={{ alignItems: 'center', flexDirection: 'row' }}>
            <Text style={{ color: colors.text, flex: 1, fontSize: 14 }}>{item.label}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{item.value} · {item.percent}%</Text>
          </View>
          <View style={{ backgroundColor: colors.surfaceSubtle, borderRadius: radius.pill, height: 8, marginTop: 10, overflow: 'hidden' }}>
            <View style={{ backgroundColor: colors.text, borderRadius: radius.pill, height: 8, width: `${item.percent}%` }} />
          </View>
        </View>
      ))}
    </View>
  );
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}
