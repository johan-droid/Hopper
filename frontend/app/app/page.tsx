'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ROUTES } from '../../src/lib/routes';

export default function AppPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace(ROUTES.overview);
  }, [router]);
  return null;
}
