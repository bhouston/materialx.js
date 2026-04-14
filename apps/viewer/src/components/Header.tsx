import { Link } from '@tanstack/react-router'
import { Box, Github } from 'lucide-react'
import ThemeToggle from './ThemeToggle'

export default function Header() {
  return (
    <header className="border-b border-border bg-card px-4">
      <nav className="page-wrap flex h-14 items-center gap-4">
        <Link
          className="inline-flex items-center gap-2 text-foreground no-underline"
          search={{}}
          to="/"
        >
          <Box className="size-5" />
          <span className="text-base font-semibold">Viewer</span>
        </Link>

        <div className="ml-auto flex items-center gap-4">
          <Link
            activeProps={{ className: 'text-foreground' }}
            className="text-sm text-muted-foreground no-underline transition-colors hover:text-foreground"
            to="/"
          >
            Home
          </Link>
          <Link
            activeProps={{ className: 'text-foreground' }}
            className="text-sm text-muted-foreground no-underline transition-colors hover:text-foreground"
            to="/about"
          >
            About
          </Link>
          <a
            aria-label="GitHub repository"
            className="text-muted-foreground transition-colors hover:text-foreground"
            href="https://github.com/materialx"
            rel="noopener noreferrer"
            target="_blank"
          >
            <Github className="size-5" />
          </a>
          <ThemeToggle />
        </div>
      </nav>
    </header>
  )
}
