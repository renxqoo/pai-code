import * as React from 'react';
import { Image, type ImageStyle } from 'react-native';

type MarkdownImageProps = { uri: string; alt?: string | undefined; style?: ImageStyle | undefined };

/** 正文图片（宽度撑满、按原图比例定高；比例未知时先给固定高兜底）。
 * 取尺寸只随 uri 变化执行一次——库的 MDImage 在无依赖 effect 里重取尺寸，
 * 会形成「取尺寸→setState→渲染→再取」的无限循环（真机上是持续网络/电量泄漏）。 */
export function MarkdownImage({ uri, alt, style }: MarkdownImageProps) {
  const [aspectRatio, setAspectRatio] = React.useState<number | undefined>(undefined);
  React.useEffect(() => {
    let alive = true;
    Image.getSize(
      uri,
      (width, height) => {
        if (alive && width > 0 && height > 0) setAspectRatio(width / height);
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [uri]);
  return (
    <Image
      accessibilityLabel={alt}
      accessibilityRole="image"
      source={{ uri }}
      style={[{ width: '100%', ...(aspectRatio === undefined ? { height: 200 } : { aspectRatio }) }, style]}
    />
  );
}
