export const siteConfig = {
  name: 'Orianna CRM',
  title: 'Orianna CRM - AI-native B2B prospecting for real estate operators',
  description:
    'Orianna CRM helps property managers and real estate teams find prospects, personalize outreach, run SMTP sequences, track replies, and operate sales workflows from Telegram.',
  locale: 'fr_FR',
  keywords: [
    'Orianna CRM',
    'AI CRM',
    'property management CRM',
    'real estate prospecting',
    'syndic CRM',
    'administrateur de biens',
    'SMTP outreach',
    'Telegram sales assistant',
    'MCP CRM',
  ],
  publicRoutes: ['/login'],
  appRoutes: ['/launch', '/threads', '/automations', '/outbound', '/contacts', '/conversations', '/settings'],
  agentRoutes: ['/llms.txt', '/llms-full.txt', '/.well-known/ai-actions', '/.well-known/mcp', '/api/openapi'],
};

export function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://orianna-crm.vercel.app').replace(/\/$/, '');
}

export function absoluteUrl(path = '/') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getSiteUrl()}${normalizedPath}`;
}
