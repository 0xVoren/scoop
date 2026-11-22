import type { NextConfig } from 'next'

/** Optional subpath for project Pages, e.g. `/scoop` → user.github.io/scoop/ */
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '')

const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  // GitHub Pages serves directories; trailing slash avoids 404 on nested paths.
  trailingSlash: true,
  ...(basePath
    ? {
        basePath,
        assetPrefix: basePath,
      }
    : {}),
}

export default nextConfig
