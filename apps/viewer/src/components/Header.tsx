import { Link } from '@tanstack/react-router'
import { Box, Github } from 'lucide-react'
import { Button } from './ui/button'

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/90 bg-background/95 px-4 backdrop-blur-sm">
      <nav className="page-wrap flex h-14 items-center gap-4">
        <Link className="inline-flex items-center gap-2 text-foreground no-underline" search={{ capture: undefined, material: undefined }} to="/">
          <span className="grid size-8 place-items-center rounded-md border border-border bg-card shadow-[var(--shadow-soft)]">
            <Box className="size-4" />
          </span>
          <span className="leading-tight">
            <span className="block text-xs tracking-[0.14em] text-muted-foreground uppercase">materialx.js</span>
            <span className="block text-sm font-semibold">Viewer</span>
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-1">
          <Button asChild size="sm" variant="ghost">
            <Link activeProps={{ className: 'text-foreground' }} className="text-muted-foreground no-underline" search={{ capture: undefined, material: undefined }} to="/">
              Home
            </Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link
              activeProps={{ className: 'text-foreground' }}
              className="text-muted-foreground no-underline"
              search={{ capture: undefined }}
              to="/about"
            >
              About
            </Link>
          </Button>
          <Button asChild size="icon" variant="outline">
            <a
              aria-label="GitHub repository"
              href="https://github.com/materialx"
              rel="noopener noreferrer"
              target="_blank"
            >
              <Github className="size-4" />
            </a>
          </Button>
        </div>
      </nav>
    </header>
  )
}
