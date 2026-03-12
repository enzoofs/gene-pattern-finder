import { Header } from './Header'

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-deep-bg flex flex-col">
      <Header />
      <main className="flex-1 flex flex-col">
        {children}
      </main>
    </div>
  )
}
