import { createSignal, onMount } from 'solid-js'
import Lobby from './Lobby'
import Game from './Game'
import { navigate } from './utils/test.js'

export default function App() {
  const [route, setRoute] = createSignal({ name: 'lobby' })
  function parseRoute(path) {
    if (!path || path === '/' || path === '') return { name: 'lobby' }
    const parts = path.split('/').filter(Boolean)
    if (parts[0] === 'game' && parts[1]) return { name: 'game', id: parts[1] }
    return { name: 'lobby' }
  }


  onMount(() => {
    setRoute(parseRoute(window.location.pathname))
    window.addEventListener('popstate', () => setRoute(parseRoute(window.location.pathname)))
  })

  function handleJoin(id) {
    navigate(`/game/${id}`)
  }

  return (
    <div class="rs-container font-sans">
      <header class="mb-6">
        <h1 class="text-2xl font-semibold text-gray-800">RustSet — Game Lobby</h1>
      </header>

      {route().name === 'lobby' && <Lobby onJoin={handleJoin} />}

      {route().name === 'game' && (
        <div>
          <button class="mb-4 inline-block px-3 py-1 bg-gray-200 rounded hover:bg-gray-300" onClick={() => navigate('/')}>Back to Lobby</button>
          <Game id={route().id} />
        </div>
      )}
    </div>
  )
}
