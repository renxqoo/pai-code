import * as React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius } from '@/theme/tokens';
import type { ExecutionTodo } from '@/features/chat/active-execution';

type ExecutionTodoRowProps = { todo: ExecutionTodo };

export function ExecutionTodoRow({ todo }: ExecutionTodoRowProps) {
  const { colors } = useAppTheme();
  const active = todo.state === 'current';
  return <View style={{ alignItems: 'center', flexDirection: 'row', minHeight: 28 }}><View style={{ alignItems: 'center', height: 20, justifyContent: 'center', width: 20 }}>{todo.state === 'done' ? <Check color={colors.success} size={15} strokeWidth={2.4} /> : active ? <ActivityIndicator color={colors.text} size="small" /> : <View style={{ borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, height: 12, width: 12 }} />}</View><Text numberOfLines={1} style={{ color: active ? colors.text : colors.textMuted, flex: 1, fontSize: 11, fontWeight: active ? '600' : '400', marginLeft: 7 }}>{todo.title}</Text><Text numberOfLines={1} style={{ color: colors.textFaint, fontSize: 9, marginLeft: 8, maxWidth: 112 }}>{todo.detail}</Text></View>;
}
