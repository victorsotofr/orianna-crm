import type { NextConfig } from "next";
// import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Configuration optimized for Vercel serverless deployment
  serverExternalPackages: ['nodemailer', 'imapflow'],
};

// Temporarily disabled Sentry for local dev (module not installed)
export default nextConfig;

// export default withSentryConfig(nextConfig, {
//   org: process.env.SENTRY_ORG,
//   project: process.env.SENTRY_PROJECT,
//   authToken: process.env.SENTRY_AUTH_TOKEN,
//   widenClientFileUpload: true,
//   tunnelRoute: "/monitoring",
//   silent: !process.env.CI,
// });
