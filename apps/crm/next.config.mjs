/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  transpilePackages: ['@viox/db', '@viox/ui', '@viox/integrations', '@viox/agents'],
};
export default nextConfig;
