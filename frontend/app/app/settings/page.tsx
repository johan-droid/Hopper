'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ROUTES } from '@/lib/routes';

export default function SettingsRedirectRoute() {
  const router = useRouter();
  useEffect(() => {
    router.replace(ROUTES.settingsGeneral);
  }, [router]);
  return null;
}
