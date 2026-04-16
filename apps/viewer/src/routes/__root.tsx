import { HeadContent, Link, Scripts, createRootRoute, useRouterState } from '@tanstack/react-router';
import { GoogleAnalytics } from 'tanstack-router-ga4';
import Footer from '../components/Footer';
import Header from '../components/Header';

import appCss from '../styles.css?url';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'MaterialX Viewer',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  notFoundComponent: ViewerNotFound,
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  const isEmbedRoute = useRouterState({
    select: (state) => state.location.pathname === '/embed',
  });

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body
        className={
          isEmbedRoute
            ? 'h-screen w-screen overflow-hidden [overflow-wrap:anywhere]'
            : 'flex min-h-screen flex-col [overflow-wrap:anywhere]'
        }
      >
        <GoogleAnalytics measurementId="G-2HVC3XM9XH" />
        {isEmbedRoute ? null : <Header />}
        <main className={isEmbedRoute ? 'h-full w-full' : 'flex-1 page-main'}>{children}</main>
        {isEmbedRoute ? null : <Footer />}
        <Scripts />
      </body>
    </html>
  );
}

function ViewerNotFound() {
  return (
    <div className="page-wrap flex min-h-[50vh] flex-col items-center justify-center gap-4 py-12 text-center">
      <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">404</p>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Page not found</h1>
      <p className="max-w-lg text-sm text-muted-foreground">
        This viewer route does not exist. Go back to the MaterialX viewer home page to load a material.
      </p>
      <Link
        className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground no-underline transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        search={{ material: undefined }}
        to="/"
      >
        Back to viewer
      </Link>
    </div>
  );
}
