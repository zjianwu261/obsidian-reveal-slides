/** 导出目录/文件名的公共处理（HTML 与 PPTX 导出共用） */

/** 导出文件名中的非法字符替换为 '-' */
export function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '-').trim() || 'slides';
}

/** 设置里的导出目录是 vault 相对路径（默认 /export），统一去掉开头斜杠 */
export function exportRelativeDir(exportDirectory: string): string {
  return exportDirectory.replace(/^[/\\]+/, '') || 'export';
}
