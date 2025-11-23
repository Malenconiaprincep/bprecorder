/** @type {import('next').NextConfig} */
const nextConfig = {
  // 增加 API 路由超时时间（仅开发环境有效）
  experimental: {
    // 注意：在生产环境（如 Vercel）中，超时时间由平台控制
    // Vercel Hobby 计划：10秒，Pro 计划：60秒
  },
};

module.exports = nextConfig;

