import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  component: About,
})

function About() {
  return (
    <main className="page-wrap px-4 py-6">
      <section className="rounded-lg border border-border bg-card p-6">
        <h1 className="mb-3 text-2xl font-semibold">About the Viewer</h1>
        <p className="m-0 max-w-3xl text-sm leading-6 text-muted-foreground">
          This app previews MaterialX documents with the <code>@materialx-js/materialx-three</code> compiler and a live
          Three.js rendering viewport. Use it to test sample graphs, import custom files, and inspect diagnostics.
        </p>
      </section>
    </main>
  )
}
