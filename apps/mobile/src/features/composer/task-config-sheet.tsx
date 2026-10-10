import * as React from 'react';
import { Text, TextInput, View } from 'react-native';
import { BrainCircuit, ShieldCheck, Sparkles } from 'lucide-react-native';
import { Sheet } from '@/components/ui/sheet';
import { PickerRow } from '@/components/composer/picker-row';
import { useComposerStore } from '@/store/composer-store';
import { useNavigationStore } from '@/store/navigation-store';
import { useAppTheme } from '@/theme/theme-context';
import { radius, spacing } from '@/theme/tokens';
import { permissionModes, thinkingLevels, copy } from '@/strings/zh';
import { useConversationStore } from '@/store/conversation-store';
import { getBridge } from '@/mobile/relay/runtime';

export function TaskConfigSheet() {
  const { colors } = useAppTheme();
  const visible = useNavigationStore((state) => state.sheet === 'task-config');
  const close = useNavigationStore((state) => state.closeSheet);
  const store = useComposerStore();
  const [query, setQuery] = React.useState('');
  // 真模型目录（连接态消费 get_models——目录来自电脑端，未连接时留空不给占位）
  const [catalog, setCatalog] = React.useState<Array<{ id: string; name: string; provider: string; description: string }>>([]);
  const [liveThread, setLiveThread] = React.useState<string | null>(null);
  const bridge = getBridge();
  const bridgeReady = bridge?.status === 'ready' || bridge?.status === 'connected';
  React.useEffect(() => {
    if (!visible || !bridgeReady || bridge === null) return;
    void bridge.client.invoke('model/list', {}).then((raw) => {
      const outcome = raw as { ok: boolean; data?: unknown };
      if (outcome.ok) {
        const rows = Array.isArray(outcome.data) ? (outcome.data as Array<{ provider: string; modelId: string; reasoning?: boolean }>) : [];
        // id 带渠道前缀：写档命令按 provider/modelId 寻址，与默认模型页同一口径
        setCatalog(rows.map((row) => ({ id: `${row.provider}/${row.modelId}`, name: row.modelId, provider: row.provider, description: row.reasoning === true ? '支持思考模式' : '' })));
      }
    });
  }, [visible, bridgeReady, bridge]);
  // 写档类命令（set_model/set_thinking/permission）要求 host 侧有活线程；
  // 新会话尚未开线程时把它们显式关掉，避免点了没反应。
  React.useEffect(() => {
    if (!visible || !bridgeReady || bridge === null) return;
    void bridge.client.invoke('session/liveThreads', {}).then((raw) => {
      const outcome = raw as { ok: boolean; data?: { sessions?: Array<{ threadId?: string; state?: string }> } };
      if (!outcome.ok || !Array.isArray(outcome.data?.sessions)) {
        setLiveThread(null);
        return;
      }
      const active = useConversationStore.getState().activeSessionId;
      const row = outcome.data.sessions.find((item) => item.threadId === active && item.state === 'live');
      setLiveThread(row?.threadId ?? null);
    });
  }, [visible, bridgeReady, bridge]);
  const modelRows = catalog
    .filter((item) => `${item.name}${item.provider}`.toLowerCase().includes(query.toLowerCase()));
  // 连接模式：写档即时同步 hub（下一 turn 生效——setModel/setThinking/setMode）；
// 无活线程时仅本地留存（host 侧无投递目标，发命令恒失败）
  const syncRemote = (kind: 'model' | 'thinking' | 'permission', value: string): void => {
    const bridge = getBridge();
    const threadId = liveThread;
    if (bridge?.status !== 'ready' || threadId === null) return;
    if (kind === 'model') {
      const [provider, ...rest] = value.split('/');
      if (rest.length === 0) return;
      void bridge.client.invoke('session/setModel', { threadId, provider, modelId: rest.join('/') });
    } else if (kind === 'thinking') {
      void bridge.client.invoke('session/setThinking', { threadId, level: value });
    } else {
      void bridge.client.invoke('permission/setMode', { threadId, mode: value });
    }
  };
  return (
    <Sheet onClose={close} title="任务配置" visible={visible}>
        <View style={{ alignItems: 'center', flexDirection: 'row', marginBottom: spacing.sm, marginTop: spacing.xs }}><Sparkles color={colors.textMuted} size={16} /><Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', marginLeft: 7 }}>模型</Text></View>
        <TextInput accessibilityLabel="搜索模型" onChangeText={setQuery} placeholder="搜索模型或渠道" placeholderTextColor={colors.textFaint} style={{ backgroundColor: colors.surfaceSubtle, borderRadius: radius.pill, color: colors.text, fontSize: 14, marginBottom: spacing.xs, minHeight: 44, paddingHorizontal: 14 }} value={query} />
        {modelRows.length === 0 ? <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 19, paddingHorizontal: 3, paddingVertical: spacing.xs2 }}>{copy.taskConfigNoModels}</Text> : null}
        {modelRows.map((item) => <PickerRow detail={item.description} key={item.id} label={item.name} meta={item.provider} selected={store.model === item.id} onPress={() => { store.selectModel(item.id); syncRemote('model', item.id); }} />)}
        <View style={{ alignItems: 'center', flexDirection: 'row', marginBottom: spacing.sm, marginTop: spacing.xs3 }}><BrainCircuit color={colors.textMuted} size={16} /><Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', marginLeft: 7 }}>思考强度</Text></View>
        {thinkingLevels.map((item) => <PickerRow detail={item.detail} key={item.id} label={item.label} selected={store.thinking === item.id} onPress={() => { store.selectThinking(item.id); syncRemote('thinking', item.id); }} />)}
        <View style={{ alignItems: 'center', flexDirection: 'row', marginBottom: spacing.sm, marginTop: spacing.xs3 }}><ShieldCheck color={colors.textMuted} size={16} /><Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', marginLeft: 7 }}>权限模式</Text></View>
        {permissionModes.map((item) => <PickerRow detail={item.detail} key={item.id} label={item.label} selected={store.permission === item.id} onPress={() => { store.selectPermission(item.id); syncRemote('permission', item.id); }} />)}
        <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 19, marginTop: spacing.sm }}>{liveThread === null && bridgeReady ? copy.taskConfigPending : copy.taskConfigHint}</Text>
    </Sheet>
  );
}
