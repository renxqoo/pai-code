import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronDown, ChevronRight, Folder, Plus } from 'lucide-react-native';

import { useAppTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';
import { copy } from '@/strings/zh';

type ProjectGroupHeaderProps = {
  /** 项目显示名（工作目录末段名；空串表示未选工作空间，调用方已回落占位名）。 */
  name: string;
  /** 组内全量会话数——折叠态下也是真实条数。 */
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  onNewTask: () => void;
};

/** 项目组头行：折叠箭头 + 文件夹 + 项目名 + 条数 + 组内新建对话（对齐桌面端侧栏项目行）。 */
export function ProjectGroupHeader({ name, count, collapsed, onToggle, onNewTask }: ProjectGroupHeaderProps) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityLabel={collapsed ? copy.expandProject(name) : copy.collapseProject(name)}
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsed }}
        onPress={onToggle}
        style={({ pressed }) => ({ ...styles.toggle, opacity: pressed ? 0.62 : 1 })}
        testID="project-group-toggle"
      >
        {collapsed ? <ChevronRight color={colors.textFaint} size={16} strokeWidth={1.75} /> : <ChevronDown color={colors.textFaint} size={16} strokeWidth={1.75} />}
        <Folder color={colors.textMuted} size={15} strokeWidth={1.75} style={styles.folder} />
        <Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>{name}</Text>
        <Text style={[styles.count, { color: colors.textFaint }]}>{count}</Text>
      </Pressable>
      <Pressable
        accessibilityLabel={copy.newTaskInProject(name)}
        accessibilityRole="button"
        hitSlop={8}
        onPress={onNewTask}
        style={({ pressed }) => ({ ...styles.newTask, opacity: pressed ? 0.62 : 1 })}
        testID="project-group-new-task"
      >
        <Plus color={colors.textMuted} size={17} strokeWidth={1.9} />
      </Pressable>
    </View>
  );
}

const styles = {
  row: { alignItems: 'center' as const, flexDirection: 'row' as const, minHeight: 40, paddingRight: spacing.xs2 },
  toggle: { alignItems: 'center' as const, flex: 1, flexDirection: 'row' as const, minHeight: 40 },
  folder: { marginLeft: 5 },
  name: { flex: 1, fontSize: 13, fontWeight: '600' as const, marginLeft: 7 },
  count: { fontSize: 11, marginLeft: 6 },
  newTask: { alignItems: 'center' as const, height: 36, justifyContent: 'center' as const, width: 36 },
};