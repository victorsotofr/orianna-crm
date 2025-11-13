import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    // Ignore handlebars warnings about require.extensions
    config.ignoreWarnings = [
      { module: /node_modules\/handlebars\/lib\/index\.js/ },
    ];
    
    return config;
  },
};

export default nextConfig;
