import {
  Activity,
  BookOpen,
  Cog,
  CreditCard,
  GitBranch,
  LayoutDashboard,
  Plug,
  Search,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const ROUTES = {
  landing: '/',
  login: '/login',
  signup: '/signup',
  overview: '/app/overview',
  repositories: '/app/repositories',
  repository: (id: string) => `/app/repositories/${encodeURIComponent(id)}`,
  activity: '/app/activity',
  failure: (failureId: string) => `/app/failures/${encodeURIComponent(failureId)}`,
  investigations: '/app/investigations',
  investigation: (signatureId: string) => `/app/investigations/${encodeURIComponent(signatureId)}`,
  diagnoses: '/app/diagnoses',
  trends: '/app/trends',
  integrations: '/app/integrations',
  settings: '/app/settings',
  settingsGeneral: '/app/settings/general',
  members: '/app/settings/members',
  security: '/app/settings/security',
  billing: '/app/settings/billing',
} as const;

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  description: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Workspace',
    items: [
      { to: ROUTES.overview, label: 'Overview', icon: LayoutDashboard, end: true, description: 'Failure overview and recurring signatures' },
      { to: ROUTES.repositories, label: 'Repositories', icon: GitBranch, description: 'Connected repositories' },
      { to: ROUTES.activity, label: 'Pipeline Activity', icon: Activity, description: 'Recorded workflow failures' },
      { to: ROUTES.investigations, label: 'Investigations', icon: Search, description: 'Failure deep-dive and log sandbox' },
      { to: ROUTES.diagnoses, label: 'Diagnosis History', icon: BookOpen, description: 'Past diagnoses' },
      { to: ROUTES.trends, label: 'Reliability', icon: TrendingUp, description: 'Derived failure trends' },
    ],
  },
  {
    label: 'Manage',
    items: [
      { to: ROUTES.integrations, label: 'Integrations', icon: Plug, description: 'Connections and service status' },
      { to: ROUTES.members, label: 'Members', icon: Users, description: 'Workspace membership and roles' },
      { to: ROUTES.settingsGeneral, label: 'Settings', icon: Cog, description: 'Profile and workspace settings' },
      { to: ROUTES.billing, label: 'Billing & Usage', icon: CreditCard, description: 'Plan and usage' },
      { to: ROUTES.security, label: 'Security', icon: ShieldCheck, description: 'Session and access information' },
    ],
  },
];

/** Sub-navigation shared by every settings route. */
export const SETTINGS_TABS = [
  { to: ROUTES.settingsGeneral, label: 'General' },
  { to: ROUTES.members, label: 'Members' },
  { to: ROUTES.security, label: 'Security' },
  { to: ROUTES.billing, label: 'Billing' },
] as const;
