/**
 * relay-protocol（T58）：手机 App 侧 relay 协议栈。
 * fork 自 x-harness packages/remote-protocol（线格式真相 = x-harness docs/WIRE.md）；
 * 差异仅两处：crypto.ts 为 @noble 纯 JS 实现（Hermes 无 node:crypto）、hex.ts 去
 * Buffer。等价性由 __test__/wire-parity.test.ts 固定向量对拍钉死。
 * 不含 node:net/ws-frame 读写（RN 平台原生分帧）与 ratchet-store（App 装配层注入）。
 */
export * from "./hex.ts";
export * from "./frames.ts";
export * from "./envelope.ts";
export * from "./vocab.ts";
export * from "./limits.ts";
export * from "./ratchet.ts";
export * from "./pake.ts";
export * from "./pairing.ts";
export * from "./rekey.ts";
export * from "./chunk.ts";
export { InboundStream } from "./inbound-stream.ts";
export { parseFrame } from "./reliable.ts";
export { OutboxStream } from "./outbox.ts";
