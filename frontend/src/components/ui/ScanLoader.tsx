import { motion } from 'framer-motion'

interface ScanLoaderProps {
  message?: string
}

export function ScanLoader({ message = 'Processing...' }: ScanLoaderProps) {
  return (
    <div className="relative w-full h-[100px] overflow-hidden rounded border border-border bg-panel/40">
      {/* Scanning line */}
      <motion.div
        className="absolute left-0 right-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(6,182,212,0.1) 10%, rgba(6,182,212,0.8) 50%, rgba(6,182,212,0.1) 90%, transparent 100%)',
          boxShadow: '0 0 8px rgba(6,182,212,0.4)',
        }}
        animate={{ top: ['0%', '100%'] }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'linear',
        }}
      />

      {/* Faint grid overlay */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage:
            'linear-gradient(rgba(6,182,212,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.3) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      />

      {/* Message */}
      <div className="absolute inset-0 flex items-end justify-center pb-4">
        <motion.span
          className="font-mono text-sm text-cyan"
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          {message}
        </motion.span>
      </div>
    </div>
  )
}
