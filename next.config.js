/** @type {import('next').NextConfig} */
const nextConfig = {
  // 排除 miniapp 目录，避免被打包
  outputFileTracingExcludes: {
    '*': ['./miniapp/**/*'],
  },
  // 排除 miniapp 目录，避免被打包（webpack 配置）
  webpack: (config, { isServer }) => {
    // 排除 miniapp 目录
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ['**/node_modules/**', '**/miniapp/**'],
    };
    
    return config;
  },
  // Turbopack 配置（Next.js 16 默认使用）
  turbopack: {
    // 排除 miniapp 目录
    resolveAlias: {
      // 可以在这里添加别名配置
    },
  },
};

module.exports = nextConfig;

