import * as React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { ExternalLink, FileText, Heart, Scale } from 'lucide-react-native';
import { PageHeader } from '@/components/navigation/page-header';
import { Card } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { PaiMark } from '@/components/brand/pai-mark';
import { SectionHeader } from '@/components/ui/section-header';
import { useAppTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

export default function AboutRoute() {
  const { colors } = useAppTheme();
  return <View style={{ backgroundColor: colors.settingsBackground, flex: 1 }}><PageHeader title="关于 Pai Code" /><ScrollView contentContainerStyle={{ padding: spacing.xs3 }}><View style={{ alignItems: 'center', paddingVertical: spacing.xs6 }}><PaiMark size={68} /><Text style={{ color: colors.text, fontSize: 24, fontWeight: '700', marginTop: spacing.xs3 }}>Pai Code</Text><Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 5 }}>版本 0.1.0</Text></View><SectionHeader title="项目" /><Card style={{ marginTop: spacing.xs2 }}><ListRow detail="开源许可与第三方声明" icon={Scale} label="许可证" /><ListRow detail="隐私、权限与数据使用" icon={FileText} label="隐私政策" /><ListRow detail="项目仓库与更新信息" icon={ExternalLink} label="项目主页" /><ListRow detail="支持 Pai Code 持续开发" icon={Heart} label="支持 Pai" /></Card></ScrollView></View>;
}
