import * as React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { BrainCircuit, Check, ChevronDown, ChevronRight, CircleAlert } from "lucide-react-native";
import { useAppTheme } from "@/theme/theme-context";
import { radius } from "@/theme/tokens";
import { copy } from "@/strings/zh";
import type { TimelineBlock } from "@/features/chat/timeline-blocks";
import { formatTimelineDuration } from "@/features/chat/timeline-duration";

const validDuration = (value: number | undefined): number =>
  value !== undefined && Number.isFinite(value) && value > 0 ? value : 0;

const firstText = (...values: readonly (string | undefined)[]): string =>
  values.find((value) => value !== undefined && value.trim().length > 0)?.trim() ?? "";

type ActivityBlockProps = { block: Extract<TimelineBlock, { kind: "activity" }> };

export function ActivityBlock({ block }: ActivityBlockProps) {
  const { colors } = useAppTheme();
  const failedMessage = block.messages.findLast((message) => message.status === "error");
  const failed = failedMessage !== undefined;
  const runningMessage = block.messages.findLast((message) => message.status === "running");
  const latestSummary = block.messages.findLast((message) => Boolean(message.summary));
  const totalDuration = block.messages.reduce(
    (total, message) => total + validDuration(message.durationMs),
    0,
  );
  const toolMessages = block.messages.filter((message) => message.kind === "tool");
  const progressMessages = toolMessages.length > 0 ? toolMessages : block.messages;
  const runningIndex = runningMessage === undefined ? -1 : progressMessages.indexOf(runningMessage);
  const completedCount = runningIndex < 0
    ? 0
    : progressMessages.slice(0, runningIndex).filter((message) => message.status !== "error" && message.status !== "running").length;
  // 用户显式展开/收起优先；未操作时失败活动默认展开，其余默认折叠。
  const [userExpanded, setUserExpanded] = React.useState<boolean | null>(null);
  const expanded = userExpanded ?? failed;

  const title = failed
    ? copy.activityFailed
    : runningMessage
      ? `${copy.activityRunning} · ${firstText(runningMessage.title, copy.activityFallback)}`
      : `${copy.activityComplete} ${block.messages.length} ${copy.activityItemUnit}`;
  const summary = firstText(
    failedMessage?.summary,
    failedMessage?.text,
    runningMessage?.summary,
    latestSummary?.summary,
    latestSummary?.text,
  );
  const toggleLabel = expanded ? copy.collapseActivity : copy.expandActivity;

  return (
    <View
      style={{
        borderLeftColor: failed ? colors.destructive : colors.divider,
        borderLeftWidth: 1,
        marginVertical: 8,
        paddingLeft: 10,
      }}
    >
      <Pressable
        accessibilityLabel={`${toggleLabel}：${title}`}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setUserExpanded(!expanded)}
        style={({ pressed }) => ({
          alignItems: "center",
          flexDirection: "row",
          minHeight: 44,
          opacity: pressed ? 0.62 : 1,
        })}
      >
        {runningMessage ? (
          <ActivityIndicator color={colors.textMuted} size="small" />
        ) : failed ? (
          <CircleAlert color={colors.destructive} size={16} />
        ) : (
          <Check color={colors.textMuted} size={16} />
        )}
        <View style={{ flex: 1, marginLeft: 9 }}>
          <Text
            numberOfLines={1}
            style={{
              color: failed ? colors.destructive : colors.textMuted,
              fontSize: 12,
              fontWeight: "600",
            }}
          >
            {title}
          </Text>
          {summary.length > 0 ? (
            <Text numberOfLines={1} style={{ color: failed ? colors.destructive : colors.textFaint, fontSize: 11, marginTop: 2 }}>
              {summary}
            </Text>
          ) : null}
        </View>
        {runningMessage ? <Text style={{ color: colors.textFaint, fontSize: 10, marginRight: 5 }}>{completedCount} / {progressMessages.length}</Text> : null}
        {totalDuration > 0 ? (
          <Text style={{ color: colors.textFaint, fontSize: 10, marginRight: 5 }}>
            {formatTimelineDuration(totalDuration)}
          </Text>
        ) : null}
        {expanded ? (
          <ChevronDown color={colors.textFaint} size={15} />
        ) : (
          <ChevronRight color={colors.textFaint} size={15} />
        )}
      </Pressable>

      {expanded ? (
        <View
          style={{
            backgroundColor: colors.surfaceSubtle,
            borderRadius: radius.md,
            marginBottom: 4,
            overflow: "hidden",
          }}
        >
          {block.messages.map((message, index) => {
            const thinking = message.kind === "thinking";
            const running = message.status === "running";
            const error = message.status === "error";
            const itemTitle = thinking
              ? copy.activityProcess
              : firstText(message.title, message.text, copy.activityFallback);
            const itemSummary = thinking
              ? message.text.trim()
              : firstText(message.summary, message.text);
            const showDetail =
              !thinking &&
              (running || error) &&
              message.text.trim().length > 0 &&
              message.text.trim() !== itemTitle &&
              message.text.trim() !== itemSummary;
            return (
              <View
                key={message.id}
                style={{
                  borderTopColor: colors.divider,
                  borderTopWidth: index === 0 ? 0 : 1,
                  flexDirection: "row",
                  paddingHorizontal: 11,
                  paddingVertical: 10,
                }}
              >
                <View style={{ marginTop: 1 }}>
                  {thinking ? (
                    <BrainCircuit color={colors.textFaint} size={15} />
                  ) : running ? (
                    <ActivityIndicator color={colors.textMuted} size="small" />
                  ) : error ? (
                    <CircleAlert color={colors.destructive} size={15} />
                  ) : (
                    <Check color={colors.textFaint} size={15} />
                  )}
                </View>
                <View style={{ flex: 1, marginLeft: 9 }}>
                  <Text
                    style={{
                      color: error ? colors.destructive : running ? colors.text : colors.textMuted,
                      fontSize: 12,
                      fontWeight: thinking ? "500" : "600",
                    }}
                  >
                    {itemTitle}
                  </Text>
                  {itemSummary.length > 0 && itemSummary !== itemTitle && itemSummary !== summary ? (
                    <Text
                      style={{
                        color: colors.textMuted,
                        fontSize: 11,
                        lineHeight: 17,
                        marginTop: 2,
                      }}
                    >
                      {itemSummary}
                    </Text>
                  ) : null}
                  {showDetail ? (
                    <Text
                      style={{
                        color: colors.textMuted,
                        fontSize: 11,
                        lineHeight: 17,
                        marginTop: 2,
                      }}
                    >
                      {message.text}
                    </Text>
                  ) : null}
                </View>
                {validDuration(message.durationMs) > 0 ? (
                  <Text style={{ color: colors.textFaint, fontSize: 10, marginLeft: 8 }}>
                    {formatTimelineDuration(validDuration(message.durationMs))}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
