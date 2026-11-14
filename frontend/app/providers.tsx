'use client';

import React, { useState, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../src/components/ui/feedback';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              const status = (error as { status?: number })?.status ?? 0;
              if (status === 401 || status === 403 || status === 404) return false;
              return failureCount < 2;
            },
            staleTime: 15_000,
          },
          mutations: { retry: 0 },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <Suspense fallback={null}>{children}</Suspense>
      </ToastProvider>
    </QueryClientProvider>
  );
}
