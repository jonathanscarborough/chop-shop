import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Exclude Tone.js from server-side bundle
      config.externals = [...(config.externals || []), 'tone'];
    }
    return config;
  },
}

export default nextConfig
