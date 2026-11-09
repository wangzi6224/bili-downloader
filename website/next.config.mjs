/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath: '/bili-downloader',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
