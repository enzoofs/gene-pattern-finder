export default function App() {
  return (
    <div className="min-h-screen bg-deep-bg flex items-center justify-center">
      <div className="text-center">
        <h1 className="font-mono text-2xl font-bold text-text">
          GENE<span className="text-cyan">PATTERN</span>FINDER
        </h1>
        <p className="text-text-muted mt-2 font-mono text-sm">System initializing...</p>
        <div className="mt-4 w-32 h-0.5 bg-border mx-auto overflow-hidden">
          <div className="h-full bg-cyan scan-line" />
        </div>
      </div>
    </div>
  )
}
