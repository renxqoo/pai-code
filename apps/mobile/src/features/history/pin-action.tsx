import * as React from 'react';
import { Pin } from 'lucide-react-native';
import { ActionButton } from '@/components/ui/action-button';

export function PinAction({ onPress }: { onPress: () => void }) { return <ActionButton icon={Pin} label="置顶" onPress={onPress} />; }
