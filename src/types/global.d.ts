declare module '*.html' {
  const content: string;
  export default content;
}

/** 构建期内联的 iframe 资源（见 esbuild.config.mjs 的 inlineAssetsPlugin） */
declare module 'rfo:assets' {
  export const resetCss: string;
  export const revealCss: string;
  export const highlightCss: string;
  export const pluginCss: string;
  export const bundleJs: string;
}
