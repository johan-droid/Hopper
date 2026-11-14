'use client';

import React, { forwardRef, useEffect, useMemo, useCallback, useState } from 'react';
import NextLink from 'next/link';
import {
  useRouter as useNextRouter,
  usePathname as useNextPathname,
  useParams as useNextParams,
} from 'next/navigation';

export interface LinkProps
  extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to?: string;
  href?: string;
  replace?: boolean;
}

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(
  ({ to, href, replace, children, className, ...rest }, ref) => {
    const target = to || href || '/';
    return (
      <NextLink
        ref={ref}
        href={target}
        replace={replace}
        className={className}
        {...rest}
      >
        {children}
      </NextLink>
    );
  }
);
Link.displayName = 'Link';

export interface NavLinkProps
  extends Omit<LinkProps, 'className' | 'children'> {
  end?: boolean;
  className?:
    | string
    | ((props: { isActive: boolean; isPending: boolean }) => string);
  children?:
    | React.ReactNode
    | ((props: { isActive: boolean; isPending: boolean }) => React.ReactNode);
}

export const NavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(
  ({ to, href, replace, children, end, className, ...rest }, ref) => {
    const target = to || href || '/';
    const rawPath = useNextPathname() || '';
    const isActive = end
      ? rawPath === target
      : rawPath === target || (target !== '/' && rawPath.startsWith(target));

    const computedClass =
      typeof className === 'function'
        ? className({ isActive, isPending: false })
        : className;

    const renderedChildren =
      typeof children === 'function'
        ? children({ isActive, isPending: false })
        : children;

    return (
      <NextLink
        ref={ref}
        href={target}
        replace={replace}
        className={computedClass}
        aria-current={isActive ? 'page' : undefined}
        {...rest}
      >
        {renderedChildren}
      </NextLink>
    );
  }
);
NavLink.displayName = 'NavLink';

export function useNavigate() {
  const router = useNextRouter();
  return useCallback(
    (to: string | number, options?: { replace?: boolean }) => {
      if (typeof to === 'number') {
        if (typeof window !== 'undefined') {
          window.history.go(to);
        }
        return;
      }
      if (options?.replace) {
        router.replace(to);
      } else {
        router.push(to);
      }
    },
    [router]
  );
}

export function useLocation() {
  const pathname = useNextPathname() || '';
  const [search, setSearch] = useState('');
  const [hash, setHash] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setSearch(window.location.search);
      setHash(window.location.hash);
    }
  }, [pathname]);

  return useMemo(
    () => ({
      pathname,
      search,
      hash,
      state: null,
      key: 'default',
    }),
    [pathname, search, hash]
  );
}

export function useParams<
  T extends Record<string, string | string[] | undefined> = Record<string, string>,
>(): T {
  const params = useNextParams();
  return (params || {}) as T;
}

export function useSearchParams(): [
  URLSearchParams,
  (params: URLSearchParams | Record<string, string>) => void,
] {
  const router = useNextRouter();
  const pathname = useNextPathname();
  const [searchStr, setSearchStr] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setSearchStr(window.location.search);
    }
  }, [pathname]);

  const searchParams = useMemo(() => {
    return new URLSearchParams(searchStr);
  }, [searchStr]);

  const setSearchParams = useCallback(
    (newParams: URLSearchParams | Record<string, string>) => {
      const sp = new URLSearchParams(
        newParams instanceof URLSearchParams ? newParams.toString() : newParams
      );
      router.push(`${pathname}?${sp.toString()}`);
    },
    [router, pathname]
  );

  return [searchParams, setSearchParams];
}

export const Navigate: React.FC<{
  to: string;
  replace?: boolean;
  state?: unknown;
}> = ({ to, replace }) => {
  const router = useNextRouter();
  useEffect(() => {
    if (replace) {
      router.replace(to);
    } else {
      router.push(to);
    }
  }, [router, to, replace]);
  return null;
};

export const Outlet: React.FC<{ context?: unknown }> = () => null;

export function useRouteError(): unknown {
  return null;
}

export function isRouteErrorResponse(
  error: unknown
): error is {
  status: number;
  statusText?: string;
  data?: { message?: string };
} {
  return typeof error === 'object' && error !== null && 'status' in error;
}

export function createBrowserRouter(routes: unknown[]) {
  return routes;
}

export const RouterProvider: React.FC<{ router: unknown }> = () => null;
