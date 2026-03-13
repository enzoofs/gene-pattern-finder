import { motion } from 'framer-motion'

export function Header() {
  return (
    <header className="border-b border-border px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <motion.div
          className="w-2 h-2 rounded-full bg-cyan"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <h1 className="font-mono text-lg font-semibold tracking-tight text-text">
          GENE<span className="text-cyan">PATTERN</span>FINDER
        </h1>
        <span className="text-xs font-mono text-text-dim border border-border px-2 py-0.5">
          TimeLabs
        </span>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-xs font-mono text-text-dim">
          v0.3.0
        </span>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-green" />
          <span className="text-xs font-mono text-text-muted">SYSTEM ONLINE</span>
        </div>
      </div>
    </header>
  )
}
