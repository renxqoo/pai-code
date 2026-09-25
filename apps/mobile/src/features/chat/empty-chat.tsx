import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Code2, MessageSquareText, SearchCheck, ShieldCheck } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius, spacing } from '@/theme/tokens';
import { PaiMark } from '@/components/brand/pai-mark';
import { EmptyChatSuggestion } from '@/features/chat/empty-chat-suggestion';
import { copy } from '@/strings/zh';

type EmptyChatProps = { onWorkspace: () => void; onPrompt: (prompt: string) => void; onDemo: () => void };

export function EmptyChat({ onWorkspace, onPrompt, onDemo }: EmptyChatProps) {
  const { colors } = useAppTheme();
  return (
    <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xs5 }}>
      <PaiMark size={54} />
      <Text style={{ color: colors.text, fontSize: 25, fontWeight: '600', letterSpacing: -0.5, marginTop: spacing.xs3 }}>今天想完成什么？</Text>
      <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: spacing.xs, textAlign: 'center' }}>{copy.tagline}</Text>
      <Pressable accessibilityRole="button" onPress={onWorkspace} style={({ pressed }) => ({ backgroundColor: colors.primary, borderRadius: radius.pill, marginTop: spacing.xs4, opacity: pressed ? 0.65 : 1, paddingHorizontal: 18, paddingVertical: 11 })}><Text style={{ color: colors.primaryText, fontSize: 13, fontWeight: '600' }}>选择工作空间</Text></Pressable>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center', marginTop: spacing.xs6, maxWidth: 340 }}>
        <EmptyChatSuggestion icon={Code2} label={copy.quickAnalyze} onPress={() => onPrompt('分析当前项目结构、关键模块和潜在风险，并给出可执行改进计划。')} />
        <EmptyChatSuggestion icon={SearchCheck} label={copy.quickFix} onPress={() => onPrompt('定位当前项目中的错误或失败测试，分析根因并完成修复。')} />
        <EmptyChatSuggestion icon={ShieldCheck} label={copy.quickReview} onPress={() => onPrompt('审查当前代码变更，检查正确性、安全性和可维护性。')} />
        <EmptyChatSuggestion icon={MessageSquareText} label="查看示例对话" onPress={onDemo} />
      </View>
    </View>
  );
}
