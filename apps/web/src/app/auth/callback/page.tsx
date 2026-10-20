import type { Metadata } from 'next';
import { AuthCallbackPage } from '../../../components/auth-pages';
export const metadata: Metadata = { referrer: 'no-referrer', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export default function Page() { return <AuthCallbackPage />; }
