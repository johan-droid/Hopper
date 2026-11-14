import React from 'react';
import { Outlet } from 'react-router-dom';
import { SegmentedNav } from '../../components/ui/feedback';
import { SETTINGS_TABS } from '../../lib/routes';

/** Shared chrome for /app/settings/*: the sub-navigation lives in one place. */
export const SettingsLayout: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <>
    <SegmentedNav label="Settings sections" items={SETTINGS_TABS} />
    {children ?? <Outlet />}
  </>
);

export default SettingsLayout;
