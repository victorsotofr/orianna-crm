import { redirect } from 'next/navigation';

export default async function Home() {
  // Middleware will handle the auth redirect
  // Just redirect to login, if user is logged in, middleware will redirect to dashboard
  redirect('/login');
}
