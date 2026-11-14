'use client';

import React from 'react';
import { SettingsLayout } from '../../../src/features/settings/SettingsLayout';

export default function WorkspaceSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SettingsLayout>{children}</SettingsLayout>;
}
