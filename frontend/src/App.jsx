import { createSignal, onMount } from 'solid-js'
import Lobby from './Lobby'
import Game from './Game'

export default function App() {
  const [route, setRoute] = createSignal({ name: 'lobby' })

  function parseRoute(path) {
    if (!path || path === '/' || path === '') return { name: 'lobby' }
    const parts = path.split('/').filter(Boolean)
    if (parts[0] === 'game' && parts[1]) return { name: 'game', id: parts[1] }
    return { name: 'lobby' }
  }

  function navigate(to) {
    window.history.pushState({}, '', to)
    setRoute(parseRoute(window.location.pathname))
  }

  onMount(() => {
    setRoute(parseRoute(window.location.pathname))
    window.addEventListener('popstate', () => setRoute(parseRoute(window.location.pathname)))
  })

  function handleJoin(id) {
    navigate(`/game/${id}`)
  }

  return (
    <div style={{ padding: '1rem', 'font-family': 'sans-serif' }}>
      <h1>SolidJS Game Lobby</h1>
      {route().name === 'lobby' && <Lobby onJoin={handleJoin} />}
      {route().name === 'game' && <div>
        <button onClick={() => navigate('/')}>Back to Lobby</button>
        <Game id={route().id} />
      </div>}
    </div>
  )
}
