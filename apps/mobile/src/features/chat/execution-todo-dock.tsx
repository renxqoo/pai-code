import * as React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { ChevronDown, ChevronUp, ListChecks } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius } from '@/theme/tokens';
import { formatTimelineDuration } from '@/features/chat/timeline-duration';
import { ExecutionTodoRow } from '@/features/chat/execution-todo-row';
import type { ActiveExecution } from '@/features/chat/active-execution';

type ExecutionTodoDockProps = {
  execution: ActiveExecution | null;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
};

export function ExecutionTodoDock({ execution, expanded, onExpandedChange }: ExecutionTodoDockProps) {
  const { colors } = useAppTheme();
  if (execution === null) return null;
  const current = execution.todos.find((todo) => todo.state === 'current');
  return (
    <View
      accessibilityLabel="执行清单"
      style={{ backgroundColor: colors.surface, borderRadius: radius.md, maxHeight: expanded ? 200 : 58, padding: 10, shadowColor: '#3F3F46', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 3 }}
    >
      <Pressable accessibilityLabel={expanded ? '收起执行清单' : '展开执行清单'} accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => onExpandedChange(!expanded)} style={{ alignItems: 'center', flexDirection: 'row', minHeight: 28 }}>
        <ListChecks color={colors.text} size={16} />
        <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700', marginLeft: 7 }}>执行清单</Text>
        <Text style={{ color: colors.textMuted, fontSize: 10, marginLeft: 'auto' }}>{execution.completed} / {execution.total} · {formatTimelineDuration(execution.durationMs)}</Text>
        {expanded ? <ChevronUp color={colors.textFaint} size={15} /> : <ChevronDown color={colors.textFaint} size={15} />}
      </Pressable>
      <View style={{ backgroundColor: colors.surfaceSubtle, borderRadius: radius.pill, height: 4, marginTop: 3, overflow: 'hidden' }}>
        <View style={{ backgroundColor: colors.text, borderRadius: radius.pill, height: 4, width: `${(execution.completed / Math.max(1, execution.total)) * 100}%` }} />
      </View>
      {expanded ? (
        <ScrollView contentContainerStyle={{ gap: 1, paddingTop: 3 }} showsVerticalScrollIndicator={false}>
          {execution.todos.map((todo) => <ExecutionTodoRow key={todo.id} todo={todo} />)}
        </ScrollView>
      ) : current ? (
        <Text numberOfLines={1} style={{ color: colors.text, fontSize: 10, fontWeight: '600', marginTop: 2 }}>{current.title} · {current.detail}</Text>
      ) : null}
    </View>
  );
}
