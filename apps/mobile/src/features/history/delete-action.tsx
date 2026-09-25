import * as React from 'react';
import { Trash2 } from 'lucide-react-native';
import { ActionButton } from '@/components/ui/action-button';

export function DeleteAction({ onPress }: { onPress: () => void }) { return <ActionButton destructive icon={Trash2} label="删除" onPress={onPress} />; }
