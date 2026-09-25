import * as React from 'react';
import { Archive } from 'lucide-react-native';
import { ActionButton } from '@/components/ui/action-button';

export function ArchiveAction({ onPress }: { onPress: () => void }) { return <ActionButton icon={Archive} label="归档" onPress={onPress} />; }
