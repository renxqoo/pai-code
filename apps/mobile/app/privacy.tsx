import * as React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { KeyRound, LockKeyhole, ShieldCheck, Trash2 } from 'lucide-react-native';
import { PageHeader } from '@/components/navigation/page-header';
import { Card } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { SectionHeader } from '@/components/ui/section-header';
import { PrivacyProtectionRow } from '@/features/privacy/privacy-protection-row';
import { useAppTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

export default function PrivacyRoute() {
  const { colors } = useAppTheme();
  return <View style={{ backgroundColor: colors.background, flex: 1 }}><PageHeader title="隐私与安全" /><ScrollView contentContainerStyle={{ padding: spacing.xs3 }}><Card style={{ padding: spacing.xs4 }}><ShieldCheck color={colors.success} size={26} /><Text style={{ color: colors.text, fontSize: 20, fontWeight: '700', marginTop: 10 }}>你的代码，由你掌控</Text><Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: 8 }}>Pai Code 只在任务需要时访问所选工作空间。模型凭据保存在系统受保护存储中，不会出现在界面或会话记录里。</Text></Card><SectionHeader title="安全" /><Card style={{ marginTop: spacing.xs2 }}><ListRow detail="模型凭据由系统受保护存储管理" icon={KeyRound} label="凭据状态" /><ListRow detail="自动批准操作仅作用于当前会话" icon={LockKeyhole} label="权限策略" /><ListRow detail="缓存与演示数据" icon={Trash2} label="本地数据" /></Card><SectionHeader title="诊断" /><Card style={{ marginTop: spacing.xs2, overflow: 'hidden' }}><PrivacyProtectionRow /></Card></ScrollView></View>;
}
