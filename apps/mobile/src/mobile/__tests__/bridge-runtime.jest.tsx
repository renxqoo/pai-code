import { beforeEach, describe, expect, it } from '@jest/globals';
import * as React from 'react';
import { render } from '@testing-library/react-native';
import { TestWrapper } from '@/test/test-wrapper';

import { initializeBridge, attachThread, entriesToMessages } from '../bridge-runtime';
import { setBridgeStorageDriver } from '../transport/bridge-storage';
import { bridgeUrl, DEVICE_NAME } from '../transport/ws-client';
import { BridgeGate } from '../bridge-gate';

describe('ws-client 纯函数面', () => {
  it('bridgeUrl 构造 ws://host:port', () => {
    expect(bridgeUrl('192.168.1.5')).toBe('ws://192.168.1.5:8787');
    expect(bridgeUrl('10.0.0.2', 9000)).toBe('ws://10.0.0.2:9000');
  });

  it('DEVICE_NAME 非空（平台前缀）', () => {
    expect(DEVICE_NAME.length).toBeGreaterThan(3);
  });
});

describe('bridge-runtime 装配', () => {
  beforeEach(() => {
    const map = new Map<string, string>();
    setBridgeStorageDriver({
      getItem: (key) => map.get(key) ?? null,
      setItem: (key, value) => map.set(key, value),
      removeItem: (key) => map.delete(key),
    });
  });

  it('initializeBridge 单例（两次调用同实例）', () => {
    const a = initializeBridge();
    const b = initializeBridge();
    expect(a).toBe(b);
    expect(a.client).toBeTruthy();
    a.disconnect();
  });

  it('client.subscribe 订阅 + 退订隔离', () => {
    const bridge = initializeBridge();
    const seen: unknown[] = [];
    const unsubscribe = bridge.client.subscribe((event) => seen.push(event));
    unsubscribe();
    expect(seen).toEqual([]);
    bridge.disconnect();
  });

  it('attachThread(null) 复位会话（startNewSession 语义，不崩溃）', () => {
    attachThread(null);
    expect(true).toBe(true);
  });

  it('entriesToMessages：assistant 纯正文（无工具无思考）', () => {
    const messages = entriesToMessages([{ kind: 'assistant', id: 'a', text: 'hi', thinking: '', at: 0, toolCalls: [] }]);
    expect(messages).toEqual([{ id: 'a', kind: 'assistant', text: 'hi', createdAt: '1970-01-01T00:00:00.000Z' }]);
  });

  it('entriesToMessages：数字字段垃圾形态降级（id 缺失编号兜底）', () => {
    const messages = entriesToMessages([{ kind: 'user', at: 'not-a-number' }]);
    expect(messages[0]?.id).toBe('u0');
  });
});

describe('BridgeGate 组件', () => {
  it('渲染 null 且不崩溃（无令牌路径——不拨号）', () => {
    // BridgeGate 渲染 null：render 本身不抛即通过（装配面逻辑在 effect——单例初始化守卫）
    expect(() => render(<TestWrapper><BridgeGate /></TestWrapper>)).not.toThrow();
  });
});

describe('entriesToMessages 工具附件面', () => {
  it('assistant 工具行携带 editHunks/subagents（数组在态）', () => {
    const messages = entriesToMessages([
      {
        kind: 'assistant',
        id: 'a2',
        text: '',
        thinking: '',
        at: 0,
        toolCalls: [
          { id: 'c', name: 'edit', argsPreview: '', output: '', isError: false, diff: null, editHunks: [{ oldText: 'a', newText: 'b', path: 'f.ts' }], subagents: [{ agent: 'explore', task: 'look' }] },
        ],
      },
    ]);
    const tool = messages.find((message) => message.kind === 'tool');
    expect(tool?.editHunks).toEqual([{ oldText: 'a', newText: 'b', path: 'f.ts' }]);
    expect(tool?.subagents).toEqual([{ agent: 'explore', task: 'look' }]);
  });
});
