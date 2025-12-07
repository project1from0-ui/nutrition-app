/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  // 最適化を無効化してコンパイル速度を優先
  swcMinify: false,
};

export default nextConfig;
