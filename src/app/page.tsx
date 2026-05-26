import { redirect } from 'next/navigation';

export default async function Home() {
  // Middleware will send authenticated users to Launch.
  redirect('/login');
}
