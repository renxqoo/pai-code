import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { QueuedMessageCard } from "../queued-message-card";

/** 卡片容器 class 片段：灰底横条本体一次渲染恰好一个。 */
const CARD_TOKEN = "bg-muted";

function renderCard(text: string): string {
  return renderToStaticMarkup(
    <QueuedMessageCard
      text={text}
      sendNowLabel="立即"
      editLabel="编辑排队消息"
      removeLabel="移除排队消息"
      onSendNow={() => undefined}
      onEdit={() => undefined}
      onRemove={() => undefined}
    />,
  );
}

describe("QueuedMessageCard", () => {
  test("渲染消息预览文字与「立即」动作文案", () => {
    const html = renderCard("好了吗");
    expect(html).toContain("好了吗");
    expect(html).toContain("立即");
    expect(html.split(CARD_TOKEN)).toHaveLength(2);
  });

  test("三个动作按钮都带无障碍名（立即胶囊之外还有编辑与移除）", () => {
    const html = renderCard("好了吗");
    expect(html).toContain('aria-label="编辑排队消息"');
    expect(html).toContain('aria-label="移除排队消息"');
    expect(html).toContain('title="编辑排队消息"');
    expect(html).toContain('title="移除排队消息"');
  });

  test("长文本容器带 truncate 截断类，不撑破横条", () => {
    const html = renderCard("一句特别特别特别长的排队消息 ".repeat(20));
    expect(html).toContain("truncate");
  });

  test("hub 队列镜像来源只读形态：不传动作回调时不渲染动作位（队列无单条操作）", () => {
    const html = renderToStaticMarkup(<QueuedMessageCard text="排队中" />);
    expect(html).toContain("排队中");
    expect(html).not.toContain("<button");
  });
});
