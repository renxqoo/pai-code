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
  mixRatchetRoot,
  derivePakeChannelKey,
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
  /** ack 下发的 relay 连接 token / 注册 deviceId（未到 ack 时 null）。 */
  readonly relayToken: string | null;
  readonly registeredDeviceId: string | null;
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
interface DeviceIdentityLike {
  signingPub: string;
}

export interface PairingWire {
  /** socket open 等待面（CONNECTING 态 send 在浏览器抛 InvalidStateError——必须先等）。 */
  opened(): Promise<boolean>;
  send(payload: unknown): void;
  /** 下行消息（p 帧已解出）。 */
  onMessage: (listener: (message: Record<string, unknown>) => void) => () => void;
  close(): void;
}


export function createPairingSession(spec: {
  wire: PairingWire;
  endpoints: PairingEndpoints;
  pairingId: string;
  /** 网关安装 id（gw_<id> 路由地址域——载荷缺失时配对不可达，构造即拒）。 */
  /** QR 路径：gateway 临时公钥（qrPayload.gatewayEphemeralPub）。 */
  gatewayEphemeralPub?: string;
  deviceInfo: { name: string; deviceType: string; platform: string; appVersion: string };
  now?(): number;
}): PairingSessionLike {
  let sas: string | null = null;
  let sharedSecret: string | null = null;
  let channelKeyHex: string | null = null;
  let pakeState: { state: { secret: string; code: string }; message: string } | null = null;
  const listeners = new Set<(step: PairingStep) => void>();
  /** ack 帧下发的连接凭据（WIRE 设备注册收尾）。 */
  let ackRelayToken: string | null = null;
  let ackDeviceIdValue: string | null = null;
  let lastDeviceKeys: DeviceIdentityLike | null = null;
  let resendTimer: ReturnType<typeof setTimeout> | null = null;

  /** owner confirm 等待窗：裸 ack 后每秒重呈 device-keys（confirm 落账的探测轮询）。 */
  function scheduleDeviceKeysResend(): void {
    if (resendTimer !== null || lastDeviceKeys === null) return;
    resendTimer = setTimeout(() => {
      resendTimer = null;
      if (ackRelayToken !== null || lastDeviceKeys === null) return;
      sendNow({ p: 'device-keys', longTermPub: lastDeviceKeys.signingPub });
      scheduleDeviceKeysResend();
    }, 1000);
  }
  let registeredResolve: ((value: { ok: true; sharedSecret: string } | { ok: false; reason: string }) => void) | null = null;

  const emit = (step: PairingStep): void => {
    for (const listener of listeners) listener(step);
  };

  const sendFrame = (payload: unknown): void => {
    void spec.wire.opened().then((open) => {
      if (!open) {
        emit({ phase: 'failed', reason: 'not_open' });
        return;
      }
      sendNow(payload);
    });
  };

  const sendNow = (payload: unknown): void => {
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
        const rawShared = pakeFinalize(pakeState.state, message['pakeB']);
        channelKeyHex = rawShared;
        if (typeof message['confirm'] === 'string') {
          // 网关 confirm 转录 = pairingId（WIRE 手输码路径契约）
          const ok = pakeConfirmVerify(rawShared, spec.pairingId, message['confirm'] as string);
          if (!ok) {
            emit({ phase: 'failed', reason: 'confirm_mismatch' });
            return;
          }
        }
        // gateway 下发的 sas 是目视比对唯一真相（本地推导仅兜底）
        const gatewaySas = typeof message['sas'] === 'string' ? (message['sas'] as string) : '';
        sas = gatewaySas.length > 0 ? gatewaySas : sasOf(rawShared, spec.pairingId);
        emit({ phase: 'sas-shown', sas: sas ?? '' });
        emit({ phase: 'awaiting-owner' });
      }
    } else if (p === 'ack') {
      // ack 带 relayToken = owner 已 confirm 且注册落账（WIRE 设备注册收尾）
      const relayToken = typeof message['relayToken'] === 'string' ? (message['relayToken'] as string) : null;
      const ackDeviceId = typeof message['deviceId'] === 'string' ? (message['deviceId'] as string) : null;
      if (relayToken === null || relayToken.length === 0) {
        // 裸 ack：owner 尚未 confirm——等待窗口内重呈 device-keys（confirm 后 ack 携 token）
        scheduleDeviceKeysResend();
        return;
      }
      if (resendTimer !== null) {
        clearTimeout(resendTimer);
        resendTimer = null;
      }
      // 种子终定（与 gateway confirmWithSas 同式）：mixRatchetRoot(channelKey, 设备长期钥)
      const channelKey = typeof channelKeyHex === 'string' ? Buffer.from(channelKeyHex, 'hex') : null;
      const devicePub = lastDeviceKeys !== null ? lastDeviceKeys.signingPub : '';
      if (channelKey !== null && devicePub.length > 0) {
        sharedSecret = Buffer.from(mixRatchetRoot(channelKey, devicePub)).toString('hex');
      }
      ackRelayToken = relayToken;
      if (ackDeviceId !== null) ackDeviceIdValue = ackDeviceId;
      emit({ phase: 'registered' });
      const waiter = registeredResolve;
      registeredResolve = null;
      waiter?.(sharedSecret === null ? { ok: false, reason: 'no_shared' } : { ok: true, sharedSecret });
    } else if (p === 'rejected') {
      emit({ phase: 'failed', reason: typeof message['reason'] === 'string' ? (message['reason'] as string) : 'rejected' });
    }
  });

  // QR 路径：构造即发起 request（shared 由 gateway 的 establish 对称推导——
  // 设备侧同式 x25519(eph.secret, gwEphPub)）
  if (spec.gatewayEphemeralPub !== undefined) {
    emit({ phase: 'connecting' });
    const eph = generateBoxKeyPair();
    const rawShared = x25519(eph.secret, spec.gatewayEphemeralPub);
    if (rawShared === null) {
      emit({ phase: 'failed', reason: 'dh_failed' });
    } else {
      // channelKey = HKDF(rawShared)（gateway establishChannel 同式）；ratchet 种子在 ack 时
      // 经 mixRatchetRoot(channelKey, 设备长期钥) 终定（与 gateway confirmWithSas 同式）
      channelKeyHex = Buffer.from(derivePakeChannelKey(rawShared)).toString('hex');
      sendFrame({ p: 'request', ephemeralPub: eph.pub, deviceInfo: spec.deviceInfo });
      emit({ phase: 'awaiting-sas' });
    }
  }

  return {
    pairingId: spec.pairingId,
    get relayToken() {
      return ackRelayToken;
    },
    get registeredDeviceId() {
      return ackDeviceIdValue;
    },
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
      lastDeviceKeys = keys;
      sendFrame({ p: 'device-keys', longTermPub: keys.signingPub });
    },
    waitRegistered(timeoutMs = 60_000) {
      // ack 已到（注册完成）→ 立即返回（submitDeviceKeys 与 waitRegistered 间的时序解耦）
      if (ackRelayToken !== null) {
        return Promise.resolve(sharedSecret === null ? { ok: false, reason: 'no_shared' } : { ok: true, sharedSecret });
      }
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          registeredResolve = null;
          resolve({ ok: false, reason: 'timeout' });
        }, timeoutMs);
        registeredResolve = (value) => {
          clearTimeout(timer);
          resolve(value);
        };
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
