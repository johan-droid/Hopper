'use client';

import React from 'react';
import { RequireAuth } from '../../src/app/RequireAuth';
import { WorkspaceProvider } from '../../src/features/workspace/WorkspaceProvider';
import { AppShell } from '../../src/components/layout/AppShell';

export default function WorkspaceAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireAuth>
      <WorkspaceProvider>
        <AppShell>{children}</AppShell>
      </WorkspaceProvider>
    </RequireAuth>
  );
}
