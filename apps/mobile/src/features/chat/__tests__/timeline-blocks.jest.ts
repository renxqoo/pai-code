import { describe, expect, it } from "@jest/globals";
import { groupTimeline } from "@/features/chat/timeline-blocks";
import type { ChatMessage } from "@/types/domain";

const message = (id: string, kind: ChatMessage["kind"]): ChatMessage => ({
  id,
  kind,
  text: id,
  createdAt: "now",
});

describe("groupTimeline", () => {
  it("groups contiguous process messages into one activity without crossing content boundaries", () => {
    const blocks = groupTimeline([
      message("user", "user"),
      message("think-1", "thinking"),
      message("tool-1", "tool"),
      message("status-1", "status"),
      message("answer-1", "assistant"),
      message("tool-2", "tool"),
      message("think-2", "thinking"),
      message("code-1", "code"),
      message("status-2", "status"),
    ]);

    expect(blocks.map((block) => block.kind)).toEqual([
      "message",
      "activity",
      "message",
      "activity",
      "message",
      "activity",
    ]);
    expect(blocks[1]?.kind === "activity" ? blocks[1].messages.map(({ id }) => id) : []).toEqual([
      "think-1",
      "tool-1",
      "status-1",
    ]);
    expect(blocks[3]?.kind === "activity" ? blocks[3].messages.map(({ id }) => id) : []).toEqual([
      "tool-2",
      "think-2",
    ]);
  });

  it("does not merge activity across user turns or assistant messages", () => {
    const blocks = groupTimeline([
      message("tool-1", "tool"),
      message("answer", "assistant"),
      message("tool-2", "tool"),
      message("user", "user"),
      message("tool-3", "tool"),
    ]);

    expect(blocks.map((block) => block.kind)).toEqual([
      "activity",
      "message",
      "activity",
      "message",
      "activity",
    ]);
  });

  it("keeps a single process message with missing optional metadata as one safe activity", () => {
    const processMessage = message("thinking", "thinking");
    const blocks = groupTimeline([processMessage]);
    expect(blocks).toEqual([{ kind: "activity", key: "activity-thinking", messages: [processMessage] }]);
  });

  it("returns an empty timeline for no messages", () => {
    expect(groupTimeline([])).toEqual([]);
  });
});
