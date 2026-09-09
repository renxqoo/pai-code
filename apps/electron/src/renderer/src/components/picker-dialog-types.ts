/** 选择弹窗条目：id 为回调返回值（可为保留 sentinel），label 为展示文案兼搜索匹配词。 */
export type PickerDialogItem = { id: string; label: string }

/** 选择弹窗分组：heading 缺省 = 无标题组（平铺观感）；空 items 组由组件整组跳过。 */
export type PickerDialogGroup = { heading?: string; items: readonly PickerDialogItem[] }
