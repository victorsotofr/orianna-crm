export function isE2EMockMode() {
  return process.env.E2E_MOCK_OUTREACH === '1' || process.env.NEXT_PUBLIC_E2E_MOCK_OUTREACH === '1';
}

export const E2E_MOCK_USER = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'victor.soto@example.test',
  user_metadata: {
    full_name: 'Victor Soto',
  },
};

export const E2E_MOCK_WORKSPACE = {
  id: '00000000-0000-4000-8000-000000000101',
  name: 'isimple',
  slug: 'isimple',
};
