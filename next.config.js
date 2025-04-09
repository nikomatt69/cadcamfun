const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});


/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  
  // Configurazione per le API di Next.js
 
  
  // Configurazione per l'ottimizzazione delle immagini
  images: {
    domains: [
      'localhost',
      'vercel.app',
      'cadcamfun.xyz',
      'endpoint.4everland.co',
      'cadcamfun.xyz/api/*',
      'cadcamfun.xyz/api/websocket',
      'cadcamfun.xyz/favicon.ico',
      'cadcamfun.xyz/icon.png',
    ], // Domini consentiti per il caricamento delle immagini
  },
  
  // Abilita l'utilizzo dell'attributo script-src nella policy di Content Security
  
 
  // Configurazione di webpack per Next.js
  webpack: (config, { isServer }) => {
    // Imposta il fallback di risoluzione dei moduli per il modulo fs su false
    config.resolve.fallback = { fs: false, tls: false, net: false };

    // Exclude plugin files from Next.js handling to prevent global CSS import errors
    config.module.rules.push({
      test: /\.module\.css$/,
      include: /public\/plugins/,
      use: [
        {
          // Use a custom loader for plugin CSS modules
          loader: 'null-loader',
        },
      ],
    });

    // Handle plugin TypeScript files
    config.module.rules.push({
      test: /\.(ts|tsx)$/,
      include: /public\/plugins/,
      use: [
        {
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
            compilerOptions: {
              module: 'esnext',
              moduleResolution: 'node',
              target: 'es2015',
              jsx: 'preserve',
            },
          },
        },
      ],
    });

    return config;
  },

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
      {
        source: '/plugins/:path*',
        destination: '/public/plugins/:path*',
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
      {
        source: '/plugins/:path*/dist/index.js',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/javascript',
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/plugins/:path*/dist/styles.module.css',
        headers: [
          {
            key: 'Content-Type',
            value: 'text/css',
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  }
};

// Esporta la configurazione per l'utilizzo da parte di Next.js
module.exports = withBundleAnalyzer(nextConfig);