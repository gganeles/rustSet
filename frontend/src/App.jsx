import { createSignal, onMount } from 'solid-js'
import Lobby from './Lobby'
import Game from './Game'
import { navigate } from './utils/test.js'
import { preloadCardImages } from './utils/imagePreloader.js'

export default function App() {
  const [route, setRoute] = createSignal({ name: 'lobby' })
  const [imagesLoaded, setImagesLoaded] = createSignal(false)

  function parseRoute(path) {
    if (!path || path === '/' || path === '') return { name: 'lobby' }
    const parts = path.split('/').filter(Boolean)
    if (parts[0] === 'game' && parts[1]) return { name: 'game', id: parts[1] }
    return { name: 'lobby' }
  }


  onMount(() => {
    setRoute(parseRoute(window.location.pathname))
    window.addEventListener('popstate', () => setRoute(parseRoute(window.location.pathname)))

    // Preload all card images on first load
    preloadCardImages().then(result => {
      setImagesLoaded(true)
    }).catch(err => {
      console.error('Error preloading images:', err)
      setImagesLoaded(true) // Continue anyway
    })
  })

  function handleJoin(id) {
    navigate(`/game/${id}`)
  }

  return (
    <div class="h-screen font-sans">
      {route().name === 'lobby' && <Lobby onJoin={handleJoin} />}

      {route().name === 'game' && <Game id={route().id} />}
    </div>
  )
}
