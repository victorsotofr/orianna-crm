import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Configuration optimized for Vercel serverless deployment
  serverExternalPackages: ['nodemailer', 'imapflow'],
};

export default nextConfig;
