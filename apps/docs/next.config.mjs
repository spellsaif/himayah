import { createMDX } from 'fumadocs-mdx/next';

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  optimizeFonts: false,
  output: 'export',
  images: {
    unoptimized: true,
  },
  basePath: '/himayah',
};

const withMDX = createMDX();

export default withMDX(config);
