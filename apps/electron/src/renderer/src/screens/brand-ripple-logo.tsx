/** 启动页 logo：居中展示品牌标记，叠加自内向外扩散的水波纹加载动画。 */
function BrandRippleLogo({ size = 96 }: { size?: number }): React.JSX.Element {
  return (
    <div
      className="logo-ripple-stage"
      style={{ width: size * 1.9, height: size * 1.9, ['--logo-size' as string]: `${size}px` }}
    >
      <span className="logo-ripple-ring" />
      <span className="logo-ripple-ring" />
      <img
        alt=""
        aria-hidden="true"
        className="relative z-10 rounded-[22%]"
        height={size}
        src="./x3code-logo.png"
        width={size}
      />
    </div>
  );
}

export { BrandRippleLogo };
