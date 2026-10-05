/**
 * 扫码配对相机面：expo-camera CameraView onBarcodeScanned——QR 内容即桌面端
 * qrPayload JSON（relayUrl/pairingId/installationId/gatewayEphemeralPub/
 * gatewayKeyFingerprint/pairingTicket）。扫中即停扫（单次会话防连扫），
 * 权限拒绝/不可用回退引导（打开系统设置或粘贴路径）。
 */
import * as React from 'react';
import { Linking, Platform, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ScanLine } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius, spacing } from '@/theme/tokens';
import { Button } from '@/components/ui/button';

export interface QrScanModalProps {
  visible: boolean;
  onPayload(payload: string): void;
  onClose(): void;
}

export function QrScanModal(props: QrScanModalProps): React.JSX.Element {
  const { colors } = useAppTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const scannedRef = React.useRef(false);

  React.useEffect(() => {
    if (props.visible) scannedRef.current = false;
  }, [props.visible]);

  const onBarcode = (result: { data?: string }): void => {
    if (scannedRef.current) return;
    const data = typeof result.data === 'string' ? result.data.trim() : '';
    if (data.length === 0) return;
    scannedRef.current = true;
    props.onPayload(data);
  };

  if (!props.visible) return <View />;

  const granted = permission?.granted === true;
  return (
    <View style={{ alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.82)', flex: 1, justifyContent: 'center', padding: spacing.xs4 }}>
      <View style={{ alignItems: 'center', width: '100%' }}>
        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: spacing.sm }}>扫描桌面端配对二维码</Text>
        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: spacing.xs4 }}>桌面端「设置 → 设备与连接 → 发起配对」显示二维码</Text>
        <View style={{ alignItems: 'center', backgroundColor: '#000', borderColor: 'rgba(255,255,255,0.35)', borderRadius: radius.lg, borderWidth: 2, height: 260, overflow: 'hidden', width: 260 }}>
          {granted ? (
            <CameraView
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              enableTorch={false}
              onBarcodeScanned={onBarcode}
              style={{ flex: 1, width: '100%' }}
            />
          ) : (
            <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.xs4, width: '100%' }}>
              <ScanLine color="rgba(255,255,255,0.6)" size={34} />
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: spacing.sm, textAlign: 'center' }}>
                {permission?.canAskAgain === false ? '相机权限已被拒绝——请到系统设置开启后重试' : '需要相机权限来扫描二维码'}
              </Text>
              {permission?.canAskAgain === false ? (
                <Button containerStyle={{ marginTop: spacing.sm }} label="打开系统设置" onPress={() => { void Linking.openSettings(); }} size="small" />
              ) : (
                <Button containerStyle={{ marginTop: spacing.sm }} label="授权相机" onPress={() => { void requestPermission(); }} size="small" />
              )}
            </View>
          )}
          {granted ? (
            <View pointerEvents="none" style={{ borderColor: colors.primary, borderRadius: radius.md, borderWidth: 2, height: 200, position: 'absolute', width: 200 }} />
          ) : null}
        </View>
        {Platform.OS === 'web' && granted ? (
          <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: spacing.xs }}>web 端相机受限时可用「粘贴配对码」路径</Text>
        ) : null}
        <Button containerStyle={{ marginTop: spacing.xs4 }} label="取消" onPress={() => { props.onClose(); }} size="small" variant="secondary" />
      </View>
    </View>
  );
}
