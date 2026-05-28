import type { ModuleManifest } from '@fusion-module/contracts'

export const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
  }

  return response.json() as Promise<T>
}

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
