import * as React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { ExternalLink, FileText, Heart, Scale } from 'lucide-react-native';
import { PageHeader } from '@/components/navigation/page-header';
import { ContentCard } from '@/components/ui/content-card';
import { X3codeMark } from '@/components/brand/x3code-mark';
import { SectionHeader } from '@/components/ui/section-header';
import { useAppTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

export default function AboutRoute() {
  const { colors } = useAppTheme();
  return <View style={{ backgroundColor: colors.settingsBackground, flex: 1 }}><PageHeader title="关于 X3code" /><ScrollView contentContainerStyle={{ padding: spacing.xs3 }}><View style={{ alignItems: 'center', paddingVertical: spacing.xs6 }}><X3codeMark size={64} /><Text style={{ color: colors.text, fontSize: 24, fontWeight: '700', marginTop: spacing.xs3 }}>X3code</Text><Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 5 }}>版本 0.1.0</Text></View><SectionHeader title="项目" /><ContentCard items={[{ detail: '开源许可与第三方声明', icon: Scale, label: '许可证' }, { detail: '隐私、权限与数据使用', icon: FileText, label: '隐私政策' }, { detail: '项目仓库与更新信息', icon: ExternalLink, label: '项目主页' }, { detail: '支持 X3code 持续开发', icon: Heart, label: '支持 X3code' }]} /></ScrollView></View>;
}
