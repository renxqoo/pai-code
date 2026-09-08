import type { StreamdownTranslations } from 'streamdown';

import { copy } from '@/strings';

/** strings 表（copy.markdown）→ streamdown 自带控件文案映射；返回全新对象，随 locale 经应用重挂载刷新 */
function streamdownTranslations(): StreamdownTranslations {
  const labels = copy.markdown;
  return {
    close: labels.close,
    copied: labels.copied,
    copyCode: labels.copyCode,
    copyLink: labels.copyLink,
    copyTable: labels.copyTable,
    copyTableAsCsv: labels.copyTableAsCsv,
    copyTableAsMarkdown: labels.copyTableAsMarkdown,
    copyTableAsTsv: labels.copyTableAsTsv,
    downloadDiagram: labels.downloadDiagram,
    downloadDiagramAsMmd: labels.downloadDiagramMmd,
    downloadDiagramAsPng: labels.downloadDiagramPng,
    downloadDiagramAsSvg: labels.downloadDiagramSvg,
    downloadFile: labels.downloadFile,
    downloadImage: labels.downloadImage,
    downloadTable: labels.downloadTable,
    downloadTableAsCsv: labels.downloadTableCsv,
    downloadTableAsMarkdown: labels.downloadTableMarkdown,
    exitFullscreen: labels.exitFullscreen,
    externalLinkWarning: labels.externalLinkWarning,
    imageNotAvailable: labels.imageNotAvailable,
    mermaidFormatMmd: labels.mermaidFormatMmd,
    mermaidFormatPng: labels.mermaidFormatPng,
    mermaidFormatSvg: labels.mermaidFormatSvg,
    openExternalLink: labels.openExternalLink,
    openLink: labels.openLink,
    resetView: labels.resetView,
    tableFormatCsv: labels.tableFormatCsv,
    tableFormatMarkdown: labels.tableFormatMarkdown,
    tableFormatTsv: labels.tableFormatTsv,
    viewFullscreen: labels.viewFullscreen,
    zoomIn: labels.zoomIn,
    zoomOut: labels.zoomOut,
  };
}

export { streamdownTranslations };
