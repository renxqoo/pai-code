/**
 * 配对旅程客户端（T58 P3）：手机侧接 x-harness gateway pairing-server。
 *
 * 两条路径（WIRE 契约）：
 * - QR：扫桌面端 qrPayload {relayUrl, pairingId, gatewayEphemeralPub}（含 pairingTicket）→
 *   连 relay /pairing 面 → request {ephemeralPub, deviceInfo} → 回 sas {sas, gatewaySignature}
 * - 手输码：输 8 位码 → PAKE（pake-a → pake-b+confirm）
 * 共同收尾：SAS 目视比对由 owner 在桌面端确认（confirmWithSas 带 deviceLongTermPub）；
 * 手机侧呈递 device-keys 帧 → ack → 等待 ready 转正式会话。
 *
 * 帧线格式：L3 明文信封（pairing_ 地址域——配对通道无 ratchet，钥建立前的约定形态）。
 */
import {
  encodeEnvelope,
  generateSigningKeyPair,
  generateBoxKeyPair,
  pakeInitiate,
  pakeFinalize,
  pakeConfirm,
  pakeConfirmVerify,
  x25519,
} from '@paiapp/relay-protocol';

export interface PairingEndpoints {
  /** relay WSS 基址（qrPayload.relayUrl 或手动输入的 host）。 */
  relayUrl: string;
  installationId: string;
}

export interface DeviceIdentity {
  deviceId: string;
  signingSecret: string;
  signingPub: string;
}

export type PairingStep =
  | { phase: 'connecting' }
  | { phase: 'awaiting-sas' }
  | { phase: 'sas-shown'; sas: string }
  | { phase: 'awaiting-owner' }
  | { phase: 'registered' }
  | { phase: 'failed'; reason: string };

export interface PairingSessionLike {
  readonly pairingId: string;
  /** SAS 6 位（目视比对——桌面 owner 端输入确认）。 */
  readonly sas: string | null;
  /** 步进回调（UI 驱动面）；返回退订。 */
  onStep(listener: (step: PairingStep) => void): () => void;
  /** 8 位手输码发起（QR 路径跳过）。 */
  startManual(code: string, deviceName: string): Promise<void>;
  /** 呈递设备长期钥（SAS 确认后——gateway 注册表写入门）。 */
  submitDeviceKeys(keys: DeviceIdentity): Promise<void>;
  /** 等注册完成（owner confirm 落账——poll gateway 注册态或收 ready 帧）。 */
  waitRegistered(timeoutMs?: number): Promise<{ ok: true; sharedSecret: string } | { ok: false; reason: string }>;
  close(): void;
}

/** pairing 面帧收发（relay /pairing——明文 L3 信封）。 */
export interface PairingWire {
  send(payload: unknown): void;
  /** 下行消息（p 帧已解出）。 */
  onMessage: (listener: (message: Record<string, unknown>) => void) => () => void;
  close(): void;
}


export function createPairingSession(spec: {
  wire: PairingWire;
  endpoints: PairingEndpoints;
  pairingId: string;
  /** QR 路径：gateway 临时公钥（qrPayload.gatewayEphemeralPub）。 */
  gatewayEphemeralPub?: string;
  deviceInfo: { name: string; deviceType: string; platform: string; appVersion: string };
  now?(): number;
}): PairingSessionLike {
  let sas: string | null = null;
  let sharedSecret: string | null = null;
  let pakeState: { state: { secret: string; code: string }; message: string } | null = null;
  const listeners = new Set<(step: PairingStep) => void>();
  let registeredResolve: ((value: { ok: true; sharedSecret: string } | { ok: false; reason: string }) => void) | null = null;

  const emit = (step: PairingStep): void => {
    for (const listener of listeners) listener(step);
  };

  const sendFrame = (payload: unknown): void => {
    const env = encodeEnvelope({
      v: 1,
      from: `pairing_${spec.pairingId}`,
      to: `gw_${spec.endpoints.installationId}`,
      payload: Buffer.from(JSON.stringify(payload)).toString('base64'),
      nonce: Buffer.alloc(17).toString('base64'),
    });
    spec.wire.send(env);
  };


  // 下行分派
  void spec.wire.onMessage((message) => {
    const p = typeof message['p'] === 'string' ? (message['p'] as string) : '';
    if (p === 'sas') {
      sas = typeof message['sas'] === 'string' ? (message['sas'] as string) : null;
      emit({ phase: 'sas-shown', sas: sas ?? '' });
      emit({ phase: 'awaiting-owner' });
    } else if (p === 'pake-b') {
      // 手输码：finalize → confirm 互验 → 本地 SAS
      if (pakeState !== null && typeof message['pakeB'] === 'string') {
        const shared = pakeFinalize(pakeState.state, message['pakeB']);
        sharedSecret = shared;
        if (typeof message['confirm'] === 'string') {
          const ok = pakeConfirmVerify(shared, 'gateway-confirm', message['confirm']);
          if (!ok) {
            emit({ phase: 'failed', reason: 'confirm_mismatch' });
            return;
          }
        }
        const confirmBack = pakeConfirm(shared, 'device-confirm');
        sendFrame({ p: 'device-confirm', confirm: confirmBack, deviceInfo: spec.deviceInfo });
        sas = sasOf(shared, spec.pairingId);
        emit({ phase: 'sas-shown', sas: sas ?? '' });
        emit({ phase: 'awaiting-owner' });
      }
    } else if (p === 'ack') {
      // device-keys 受理（owner confirm 后 gateway 落账 → ready 见 waitRegistered）
      emit({ phase: 'registered' });
      registeredResolve?.(sharedSecret === null ? { ok: false, reason: 'no_shared' } : { ok: true, sharedSecret });
    } else if (p === 'rejected') {
      emit({ phase: 'failed', reason: typeof message['reason'] === 'string' ? (message['reason'] as string) : 'rejected' });
    }
  });

  // QR 路径：构造即发起 request（shared 由 gateway 的 establish 对称推导——
  // 设备侧同式 x25519(eph.secret, gwEphPub)）
  if (spec.gatewayEphemeralPub !== undefined) {
    emit({ phase: 'connecting' });
    const eph = generateBoxKeyPair();
    sharedSecret = x25519(eph.secret, spec.gatewayEphemeralPub);
    sendFrame({ p: 'request', ephemeralPub: eph.pub, deviceInfo: spec.deviceInfo });
    emit({ phase: 'awaiting-sas' });
  }

  return {
    pairingId: spec.pairingId,
    get sas() {
      return sas;
    },
    onStep(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async startManual(code, deviceName) {
      await Promise.resolve();
      emit({ phase: 'connecting' });
      const digits = code.replace(/[^0-9a-hj-z]/g, '').toLowerCase();
      if (digits.length !== 8) {
        emit({ phase: 'failed', reason: 'bad_code' });
        return;
      }
      pakeState = pakeInitiate(digits);
      sendFrame({ p: 'pake-a', pakeA: pakeState.message, deviceInfo: { ...spec.deviceInfo, name: deviceName } });
      emit({ phase: 'awaiting-sas' });
    },
    async submitDeviceKeys(keys) {
      await Promise.resolve();
      sendFrame({ p: 'device-keys', longTermPub: keys.signingPub });
    },
    waitRegistered(timeoutMs = 60_000) {
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          registeredResolve = null;
          resolve({ ok: false, reason: 'timeout' });
        }, timeoutMs);
        const previous = registeredResolve;
        registeredResolve = (value) => {
          clearTimeout(timer);
          resolve(value);
        };
        void previous;
      });
    },
    close() {
      spec.wire.close();
    },
  };
}

function sasOf(shared: string, pairingId: string): string {
  // SAS 由 gateway 计算下发（pake-b 确认链）——客户端侧展示回显值；
  // 手输码路径本地推算（pakeConfirm 前 6 位数字域）。
  if (shared.length === 0) return '';
  const confirm = pakeConfirm(shared, `sas|${pairingId}`);
  const value = Number.parseInt(confirm.slice(0, 8), 16) % 1_000_000;
  return value.toString().padStart(6, '0');
}

/** 设备身份生成（配对收尾——长期钥存 SecureStore）。 */
export function generateDeviceIdentity(): DeviceIdentity & { boxSecret: string; boxPub: string } {
  const signing = generateSigningKeyPair();
  const box = generateBoxKeyPair();
  return { deviceId: `dev_${box.pub.slice(0, 12)}`, signingSecret: signing.secret, signingPub: signing.pub, boxSecret: box.secret, boxPub: box.pub };
}
