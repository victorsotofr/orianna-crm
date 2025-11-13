import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Configuration optimized for Vercel serverless deployment
  experimental: {
    serverComponentsExternalPackages: ['nodemailer'],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Externalize nodemailer to prevent bundling issues
      config.externals = config.externals || [];
      config.externals.push('nodemailer');
    }
    return config;
  },
};

export default nextConfig;
