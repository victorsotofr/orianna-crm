import type { MetadataRoute } from 'next';

import { absoluteUrl, siteConfig } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    ...siteConfig.publicRoutes.map((route) => ({
      url: absoluteUrl(route),
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: route === '/login' ? 0.7 : 0.5,
    })),
    ...siteConfig.agentRoutes.map((route) => ({
      url: absoluteUrl(route),
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
  ];
}
