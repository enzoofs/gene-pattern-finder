import { Layout } from './components/layout/Layout'

export default function App() {
  return (
    <Layout>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <h2 className="font-mono text-xl text-text-muted">
            Workspace loading...
          </h2>
        </div>
      </div>
    </Layout>
  )
}
