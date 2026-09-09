import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { QueueRow } from '../queue-row';
import { UserMessageRow } from '../user-message-row';
import type { SessionMessage } from '../thread-model';

/** 与 pi 展开产物同形的用户消息文本。 */
const SKILL_TEXT =
  '<skill name="writer" location="/Users/x/skills/writer/SKILL.md">\nReferences are relative to /Users/x/skills/writer.\n\n# 写手技能\n正文首段。\n</skill>';

function renderRow(text: string): string {
  const message: SessionMessage = { id: 'm1', role: 'user', text, images: [] };
  return renderToStaticMarkup(<UserMessageRow message={message} onEdit={() => undefined} />);
}

describe('UserMessageRow 技能调用转义', () => {
  test('修复症状：技能调用 user 消息倾泻全量 SKILL.md——转义为高亮技能名胶囊，收起态不渲染正文', () => {
    const html = renderRow(SKILL_TEXT);
    expect(html).toContain('aria-label="技能 writer"');
    expect(html).toContain('title="/Users/x/skills/writer/SKILL.md"');
    expect(html).toContain('writer');
    expect(html).not.toContain('# 写手技能');
    expect(html).not.toContain('正文首段');
  })

  test('技能名后的附加指令仍以用户气泡呈现', () => {
    const html = renderRow(`${SKILL_TEXT}\n\n写一段介绍`);
    expect(html).toContain('写一段介绍')
    expect(html).not.toContain('# 写手技能')
  })

  test('非技能普通消息维持原气泡渲染', () => {
    const html = renderRow('普通用户消息');
    expect(html).toContain('普通用户消息')
    expect(html).not.toContain('技能 writer')
  })
})

describe('QueueRow 技能调用转义', () => {
  test('排队技能消息单行转义：技能名高亮 + 指令摘要，不倾泻正文', () => {
    const html = renderToStaticMarkup(<QueueRow text={`${SKILL_TEXT}\n\n排队补一句`} />)
    expect(html).toContain('writer')
    expect(html).toContain('排队补一句')
    expect(html).not.toContain('# 写手技能')
  })

  test('普通排队消息原样展示', () => {
    const html = renderToStaticMarkup(<QueueRow text="普通排队消息" />)
    expect(html).toContain('普通排队消息')
  })
})
