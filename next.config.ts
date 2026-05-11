import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['sharp', 'google-auth-library', 'xlsx'],
};

export default nextConfig;
