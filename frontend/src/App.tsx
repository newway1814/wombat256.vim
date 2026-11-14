import { useEffect, useState } from 'react'

type Health = 'checking' | 'ok' | 'down'

function App() {
  const [health, setHealth] = useState<Health>('checking')

  useEffect(() => {
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((body: { status: string }) => setHealth(body.status === 'ok' ? 'ok' : 'down'))
      .catch(() => setHealth('down'))
  }, [])

  return (
    <main>
      <h1>FabCopilot</h1>
      <p>An AI copilot for yield engineers.</p>
      <p>
        Backend: <strong data-testid="health">{health}</strong>
      </p>
    </main>
  )
}

export default App
