import * as React from 'react';

import { AttachmentChips } from '@/composer/attachment-chips';
import { imageDataUrl, readImageFile, type PendingImage } from '@/composer/read-image-file';
import { cn } from '@/lib/utils';
import { copy } from '@/strings';

/** 输入卡持有的图片附件（提交时原样交 onSubmit，协议转换由调用层负责）。 */
export type ComposerAttachment = { id: number; name: string; payload: PendingImage };

/** 底行插槽注入的控制句柄（附件选择入口住在卡片内，动作行只持有回调）。 */
export type PromptCardControls = { openFilePicker: () => void };

type PromptCardProps = {
  value: string
  /** 提交（文本 + 附件原样交出，投递语义由父层决定）；resolve true = 已发出（据此清空附件） */
  onSubmit: (text: string, attachments: readonly ComposerAttachment[]) => Promise<boolean>
  /** 附件作用域键（线程 id / 新任务页常量键）：变化即清空附件（防图片串发到别的会话） */
  scope: string
  /** 一次性图片回填信号：token 变化时把 images 并入附件态；null = 无回填 */
  restore: { token: number; images: readonly { name: string; payload: PendingImage }[] } | null
  /** 卡片顶部的排队消息堆（线程页传入；缺省不渲染） */
  queued?: React.ReactNode
  /** 输入区插槽（textarea + 补全层） */
  input: React.ReactNode
  /** 底行插槽：函数子节点拿到附件选择入口 */
  actions: (controls: PromptCardControls) => React.ReactNode
  /** 提交键可用性（缺省 = value 非空） */
  canSubmit?: boolean
  /** 卡片（form）附加类名，用于与上下文条叠合 */
  className?: string
}

/** 白卡输入壳：表单提交编排 + 图片附件态 + 排队卡片堆 + 隐藏文件选择器；输入区与底行由调用方注入。 */
function PromptCard({ value, onSubmit, scope, restore, queued, input, actions, canSubmit, className }: PromptCardProps) {
  const submittable = canSubmit ?? value.trim().length > 0;

  /** 图片附件态：读取与持有都在本组件（提交成功才清空）；预览用 data URL，无对象 URL 生命周期。 */
  const [attachments, setAttachments] = React.useState<readonly ComposerAttachment[]>([]);
  const [attachError, setAttachError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const attachSeqRef = React.useRef(0);

  const addFiles = (files: readonly File[]): void => {
    setAttachError(null);
    void Promise.all(files.map(async (file) => ({ file, image: await readImageFile(file) }))).then((results) => {
      const added: ComposerAttachment[] = [];
      for (const result of results) {
        if (result.image === null) {
          setAttachError(copy.composer.imageUnsupported);
          continue;
        }
        attachSeqRef.current += 1;
        added.push({ id: attachSeqRef.current, name: result.file.name, payload: result.image });
      }
      if (added.length > 0) setAttachments((current) => [...current, ...added]);
    });
  };

  const removeAttachment = (id: number): void => {
    setAttachments((current) => current.filter((item) => item.id !== id));
  };

  /** 一次性回填：编辑重发等通路的图片并入附件态（不覆盖已有附件），token 只消费一次 */
  const appliedRestoreTokenRef = React.useRef<number | null>(restore === null ? null : restore.token);
  React.useEffect(() => {
    if (restore === null || appliedRestoreTokenRef.current === restore.token) return;
    appliedRestoreTokenRef.current = restore.token;
    if (restore.images.length === 0) return;
    const added = restore.images.map((image) => {
      attachSeqRef.current += 1;
      return { id: attachSeqRef.current, name: image.name, payload: image.payload };
    });
    setAttachments((current) => [...current, ...added]);
  }, [restore]);

  // 切会话清空附件（文本草稿按会话隔离，附件同样不得串扰）
  const prevScopeRef = React.useRef(scope);
  React.useEffect(() => {
    if (prevScopeRef.current === scope) return;
    prevScopeRef.current = scope;
    setAttachments([]);
    setAttachError(null);
  }, [scope]);

  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!submittable) return;
          void onSubmit(value, attachments).then((sent) => {
            if (sent) setAttachments([]);
          });
        }}
        onPaste={(event) => {
          // 粘贴图片即入附件（事件从输入区冒泡上来；纯文本粘贴不受影响）
          const files = Array.from(event.clipboardData?.items ?? [])
            .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
            .map((item) => item.getAsFile())
            .filter((file): file is File => file !== null);
          if (files.length === 0) return;
          event.preventDefault();
          addFiles(files);
        }}
        className={cn(
          'rounded-[20px] border border-border bg-background shadow-[0_14px_22px_-16px_rgba(24,24,28,0.22)] transition-colors duration-150 focus-within:border-foreground/15',
          className,
        )}
      >
        {queued !== undefined && queued !== null ? (
          // 贴卡片顶部的排队堆：容器裁出与输入卡一致的内圆角，多条卡片纵向相连（旧→新）
          <div className="overflow-hidden rounded-t-[19px]">{queued}</div>
        ) : null}
        {input}
        {attachments.length > 0 ? (
          <AttachmentChips
            items={attachments.map((item) => ({ id: item.id, name: item.name, preview: imageDataUrl(item.payload) }))}
            removeLabel={copy.composer.removeImage}
            onRemove={removeAttachment}
          />
        ) : null}
        {attachError !== null ? <p className="px-4 pt-[6px] text-[11px] text-red-600">{attachError}</p> : null}
        {actions({ openFilePicker: () => fileInputRef.current?.click() })}
      </form>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          addFiles(Array.from(event.target.files ?? []));
          // 允许连续选择同一文件
          event.target.value = '';
        }}
      />
    </>
  );
}

export { PromptCard };
export type { PromptCardProps };
