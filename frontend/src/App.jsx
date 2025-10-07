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
    <div class="max-w-[84rem] mx-auto p-[1.5rem] h-screen font-sans">
      {route().name === 'lobby' && <Lobby onJoin={handleJoin} />}

      {route().name === 'game' && <Game id={route().id} />}
    </div>
  )
}
