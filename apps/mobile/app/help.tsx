import * as React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { BookOpen, Keyboard, Laptop, MessageCircleQuestion } from 'lucide-react-native';
import { PageHeader } from '@/components/navigation/page-header';
import { Card } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { SectionHeader } from '@/components/ui/section-header';
import { useAppTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

export default function HelpRoute() {
  const { colors } = useAppTheme();
  return <View style={{ backgroundColor: colors.settingsBackground, flex: 1 }}><PageHeader title="帮助与反馈" /><ScrollView contentContainerStyle={{ padding: spacing.xs3 }}><Card style={{ padding: spacing.xs4 }}><Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>需要一点帮助？</Text><Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: 8 }}>查看常见问题、连接桌面端，或把遇到的问题发送给 Pai Code 团队。</Text></Card><SectionHeader title="常见问题" /><Card style={{ marginTop: spacing.xs2 }}><ListRow detail="手机和电脑共享工作空间与会话" icon={Laptop} label="连接与同步" /><ListRow detail="附件、权限与模型选择说明" icon={BookOpen} label="使用指南" /><ListRow detail="系统返回手势与触控反馈" icon={Keyboard} label="操作方式" /></Card><SectionHeader title="反馈" /><Card style={{ marginTop: spacing.xs2 }}><ListRow detail="问题反馈不会附带代码或凭据" icon={MessageCircleQuestion} label="隐私安全反馈" /></Card></ScrollView></View>;
}
