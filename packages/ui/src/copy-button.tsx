import * as React from 'react'

import { cn } from 'cn'

type CopyButtonProps = {
  /** 无障碍名称，同时作为原生 tooltip 文案 */
  label: string
  copiedLabel: string
  value: string
  onCopy: (value: string) => Promise<boolean>
  className?: string
}

const FEEDBACK_MS = 1400

/**
 * 复制入口：点击后短暂切换为已复制态。
 * 剪贴板写入由调用方注入（渲染层系统触点集中在 lib/clipboard），
 * 反馈计时器随复制态切换与卸载清理，不留悬挂 timeout。
 */
function CopyButton({ label, copiedLabel, value, onCopy, className }: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    if (!copied) return
    const handle = window.setTimeout(() => setCopied(false), FEEDBACK_MS)
    return () => window.clearTimeout(handle)
  }, [copied])

  return (
    <button
      type="button"
      aria-label={copied ? copiedLabel : label}
      title={copied ? copiedLabel : label}
      onClick={() => {
        void onCopy(value).then((done) => {
          if (done) setCopied(true)
        })
      }}
      className={cn(
        'inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/85 outline-none transition-colors select-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50',
        className,
      )}
    >
      {copied ? (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-3">
          <path
            d="M4 12.5 9.5 18 20 6.5"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-3">
          <rect x="9" y="9" width="12" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.75" />
          <path
            d="M5.5 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v.5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  )
}

export { CopyButton }
export type { CopyButtonProps }
