import type { LucideIcon } from 'lucide-react-native';

export type ContentItem = {
  label: string;
  detail?: string | undefined;
  icon?: LucideIcon | undefined;
  trailing?: string | undefined;
  selected?: boolean | undefined;
  onPress?: (() => void) | undefined;
};
