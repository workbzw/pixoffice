import type { Plugin } from 'vite'

type ReleaseProduct = 'website' | 'office' | 'classroom' | 'farm'
export function collectReleaseAssets(directory: string, product?: ReleaseProduct): Promise<Map<string, Buffer>>
export function releaseAssetsPlugin(product?: ReleaseProduct): Plugin
