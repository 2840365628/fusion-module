import type { ModuleManifest } from '@fusion-module/contracts'

/**
 * @deprecated 不再使用。模块加载已改为接口直接返回数据、宿主侧本地拼接 manifest，
 * 不再走「fetch registry/manifest.json」的方式。保留仅为兼容，勿用于新代码。
 */
export const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
  }

  return response.json() as Promise<T>
}

/**
 * @deprecated 不再使用。manifest 资源地址现由宿主侧本地拼接（buildModuleManifest）生成，
 * 不再需要基于 manifestUrl 做归一化。保留仅为兼容，勿用于新代码。
 */
export const normalizeManifestAssetUrl = (
  manifest: ModuleManifest,
  manifestUrl: string,
): ModuleManifest => {
  return {
    ...manifest,
    entry: new URL(manifest.entry, manifestUrl).href,
    style: manifest.style ? new URL(manifest.style, manifestUrl).href : undefined,
  }
}
