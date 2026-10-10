import { useRouter } from 'expo-router';
import { useAppTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';
import { Text, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { relayCredentialsStore } from '@/mobile/relay/credentials';
import { copy } from '@/strings/zh';

/**
 * 候选为空时的空态：未配对与已配对无目录是两种处境，出路不同。
 * 未配对给「连接电脑端」直达入口（候选只能来自 PC，会话表在未连接时恒空）。
 */
export function WorkspaceEmptyState() {
  const router = useRouter();
  const { colors } = useAppTheme();
  if (relayCredentialsStore.load() === null) {
    return (
      <View>
        <Text style={{ color: colors.textMuted, fontSize: 13, paddingHorizontal: 3, paddingVertical: spacing.xs2 }}>{copy.workspaceNotPaired}</Text>
        <Button label={copy.connectedComputer} onPress={() => router.push('/devices')} />
      </View>
    );
  }
  return <Text style={{ color: colors.textMuted, fontSize: 13, paddingHorizontal: 3, paddingVertical: spacing.xs2 }}>{copy.workspaceEmpty}</Text>;
}