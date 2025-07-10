/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  eslint: {
    ignoreDuringBuilds: true,
  },

  // Tauri desktop support
  trailingSlash: true,
  output: process.env.NEXT_EXPORT === 'true' ? 'export' : undefined,
  // Fix: Use absolute path for Tauri builds
  assetPrefix: process.env.NEXT_EXPORT === 'true' ? '/' : '',

  // Export path mapping for static export - exclude problematic pages
  ...(process.env.NEXT_EXPORT === 'true' && {
    exportPathMap: async function (defaultPathMap, { dev, dir, outDir, distDir, buildId }) {
      // Remove pages that use getServerSideProps
      const {
        '/opensearch.xml': _1,
        '/sitemap.xml': _2,
        '/admin/feature-flags': _3,
        '/invitations/[token]': _4,
        '/plugins/[id]': _5,
        ...exportPathMap
      } = defaultPathMap;

      return exportPathMap;
    }
  }),

  // Configure images for static export
  images: {
    unoptimized: process.env.NEXT_EXPORT === 'true',
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'localhost',
      },
      {
        protocol: 'https',
        hostname: 'vercel.app',
      },
      {
        protocol: 'https',
        hostname: 'example.com',
      },
      {
        protocol: 'https',
        hostname: 'cadcamfun.xyz',
      },
      {
        protocol: 'https',
        hostname: 'endpoint.4everland.co',
      },
      {
        protocol: 'https',
        hostname: 'cadcamfun.xyz/api/*',
      },
      {
        protocol: 'https',
        hostname: 'cadcamfun.xyz/api/websocket',
      },

    ], // Domini consentiti per il caricamento delle immagini
  },

  // Configurazione di webpack per Next.js
  webpack: (config, { isServer, buildId, dev }) => {
    // Imposta il fallback di risoluzione dei moduli per il modulo fs su false
    config.resolve.fallback = { fs: false, tls: false, net: false };

    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };

    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: require.resolve('crypto-browserify'),
        stream: require.resolve('stream-browserify'),
        buffer: require.resolve('buffer'),
        util: require.resolve('util'),
        fs: false,
        path: false,
        http: false,
        https: false,
        child_process: false,
      };
    }
    // Fix for specific WASM issues if they arise later (keep commented for now)
    // config.output.webassemblyModuleFilename = (
    //   isServer ? '../' : ''
    // ) + 'static/wasm/[modulehash].wasm'

    // Rule to handle WASM files (might be needed if experiments flag isn't enough)
    // config.module.rules.push({
    //   test: /\.wasm$/,
    //   type: 'webassembly/async',
    // });

    return config;
  },

  // Only enable rewrites and headers for non-export builds
  ...(process.env.NEXT_EXPORT !== 'true' && {
    async rewrites() {
      return [
        {
          source: '/sitemap.xml',
          destination: '/api/sitemap',
        },
        {
          source: '/robots.txt',
          destination: '/api/robots',
        },
        {
          source: '/og-image/:path*',
          destination: '/api/og-image/:path*',
        },
      ];
    },
    async headers() {
      return [
        {
          headers: [
            { key: 'X-Content-Type-Options', value: 'nosniff' },
            { key: 'X-XSS-Protection', value: '1; mode=block' },
            { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
            { key: 'Access-Control-Allow-Origin', value: '*' },
            { key: 'Access-Control-Allow-Credentials', value: 'true' },
            { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
          ],
          source: '/(.*)'
        },
        {
          source: '/api/materials/:path*',
          headers: [
            { key: 'Cache-Control', value: 'public, max-age=60, stale-while-revalidate=300' }
          ]
        },
        {
          source: '/api/tools/:path*',
          headers: [
            { key: 'Cache-Control', value: 'public, max-age=60, stale-while-revalidate=300' }
          ]
        },
        {
          source: '/api/components/:path*',
          headers: [
            { key: 'Cache-Control', value: 'public, max-age=60, stale-while-revalidate=300' }
          ]
        },
        {
          source: '/api/machine-configs/:path*',
          headers: [
            { key: 'Cache-Control', value: 'public, max-age=60, stale-while-revalidate=300' }
          ]
        },
        {
          source: '/api/library/:path*',
          headers: [
            { key: 'Cache-Control', value: 'public, max-age=60, stale-while-revalidate=300' }
          ]
        },
        {
          source: '/api/analytics/:path*',
          headers: [
            { key: 'Cache-Control', value: 'private, max-age=0, must-revalidate' }
          ]
        },
        {
          source: '/api/auth/:path*',
          headers: [
            { key: 'Cache-Control', value: 'private, no-cache, no-store, must-revalidate' },
            { key: 'Pragma', value: 'no-cache' },
            { key: 'Expires', value: '0' }
          ]
        },
        {
          source: '/api/websocket',
          headers: [
            { key: 'Cache-Control', value: 'no-store' }
          ]
        },
        {
          source: '/api/mcp',
          headers: [
            { key: 'Cache-Control', value: 'no-store' }
          ]
        },
        {
          source: '/api/(.*)',
          headers: [
            { key: 'Cache-Control', value: 'private, no-cache, no-store, must-revalidate' }
          ]
        },
      ];
    }
  })
};

// Esporta la configurazione per l'utilizzo da parte di Next.js
module.exports = (nextConfig);