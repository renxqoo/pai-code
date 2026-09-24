import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ConfirmRequestBar } from '../confirm-request-bar';
import type { PendingDialog } from '@/live/store';

/**
 * 输入区内联确认条（Codex 式）：confirm 待答呈现从全局模态迁入输入卡顶槽——
 * 随会话走（只在发起会话的输入区出现），单条应答 + 其余计数。静态口径断言
 * 信息完整可读（统一工具提示/按钮文案/计数），交互回传由 ConfirmBody 回调直连。
 */

const base: PendingDialog = {
  requestId: 'req-1',
  threadId: 'tA',
  method: 'confirm',
  tool: 'Bash',
  summary: 'rm -rf /tmp/probe',
};

const noop = {
  onRespond: () => undefined,
  onCancel: () => undefined,
};

describe('ConfirmRequestBar 内联确认条', () => {
  test('单条待答：标题 + 工具 + 摘要（title 悬停全文）+ 允许/拒绝按钮', () => {
    const html = renderToStaticMarkup(<ConfirmRequestBar dialog={base} remaining={0} {...noop} />);
    expect(html).toContain('需要确认');
    expect(html).toContain('Bash');
    expect(html).toContain('rm -rf /tmp/probe');
    expect(html).toContain('允许');
    expect(html).toContain('拒绝');
    expect(html).not.toContain('等待');
  });

  test('多条待答：信息行带其余计数', () => {
    const html = renderToStaticMarkup(<ConfirmRequestBar dialog={base} remaining={2} {...noop} />);
    expect(html).toContain('还有 2 个请求等待');
  });

  test('子代理中继：呈现来源身份', () => {
    const html = renderToStaticMarkup(
      <ConfirmRequestBar dialog={{ ...base, agentName: 'explorer' }} remaining={0} {...noop} />,
    );
    expect(html).toContain('子智能体请求');
    expect(html).toContain('explorer');
  });

  test('缺省字段（无 tool/summary）不渲染空壳', () => {
    const html = renderToStaticMarkup(
      <ConfirmRequestBar dialog={{ requestId: 'r', threadId: 't', method: 'confirm' }} remaining={0} {...noop} />,
    );
    expect(html).toContain('需要确认');
    expect(html).toContain('允许');
    expect(html).not.toContain('undefined');
  });

  test('症状回归：审批文案曾显示「edit unknown tool:edit」、不知改哪个文件——主文案现为「工具 + 目标」一行', () => {
    const html = renderToStaticMarkup(
      <ConfirmRequestBar
        dialog={{ ...base, tool: 'edit', summary: 'src/a.ts', reason: 'unknown tool:edit' }}
        remaining={0}
        {...noop}
      />,
    );
    expect(html).toContain('>edit src/a.ts<');
    expect(html).not.toContain('>unknown tool:edit<');
  });
});
