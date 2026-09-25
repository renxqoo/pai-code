import { Platform } from 'react-native';

export const monospaceFont = Platform.select({ android: 'monospace', default: 'Menlo' });
