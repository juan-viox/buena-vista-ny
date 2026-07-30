/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@viox/db', '@viox/ui', '@viox/integrations', '@viox/agents'],
};
export default nextConfig;
