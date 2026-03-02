import * as Sentry from "@sentry/nextjs";

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  integrations: [Sentry.replayIntegration()],
  environment: process.env.NODE_ENV,
  enabled: process.env.NODE_ENV === "production",
  ignoreErrors: [
    // Supabase auth lock timeout — benign, happens when browser throttles
    // backgrounded tabs. Auth retries automatically and recovers.
    "Navigator LockManager lock",
  ],
});
