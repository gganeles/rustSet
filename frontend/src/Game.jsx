import { onCleanup, createSignal } from 'solid-js'
import SetGame from './SetGame'
import Anagrams from './Anagrams'
import { hostname } from './const.js'

export default function Game(props) {
  const [gameType, setGameType] = createSignal(null)
  const [initialData, setInitialData] = createSignal(null)
  let socket = null

  function handleInitOnly(e) {
    try {
      const data = JSON.parse(e.data)
      if (data.kind === 'init') {
        try {
          const gameData = JSON.parse(data.data)
          // Decide type based on presence of known fields, support nested envelope
          const hasBoard = gameData.board || (gameData.game && gameData.game.board)
          const hasPot = gameData.pot || (gameData.game && gameData.game.pot)
          if (hasBoard) {
            setGameType('set')
            // normalize: if nested under `game`, unwrap
            setInitialData(gameData.game || gameData)
          } else if (hasPot) {
            setGameType('anagrams')
            // anagrams payload may be wrapped as { game: {...}, chat: [...] }
            setInitialData(gameData.game || gameData)
          } else {
            // Fallback to set shape
            setGameType('set')
            setInitialData(gameData)
          }
          // stop listening for init-only handler to avoid duplicate handling
          try { socket.removeEventListener('message', handleInitOnly) } catch (e) { }
        } catch (err) {
          console.error('Error parsing init in Game router:', err)
        }
      }
    } catch (err) {
      console.error('Error parsing message in Game router:', err)
    }
  }

  function connect(id) {
    if (socket) {
      try { socket.close() } catch (e) { }
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${hostname}/game/ws/${id}`
    socket = new WebSocket(wsUrl)
    socket.addEventListener('message', handleInitOnly)
    socket.addEventListener('open', () => {
      const playerName = localStorage.getItem('rs_name') || 'Anonymous'
      const joinMsg = {
        kind: 'join_player',
        data: JSON.stringify({ name: playerName })
      }
      socket.send(JSON.stringify(joinMsg))
    })
    socket.addEventListener('close', () => { })
    socket.addEventListener('error', (err) => console.error('WebSocket error:', err))
  }

  // connect on mount
  connect(props.id)

  onCleanup(() => {
    if (socket) {
      try { socket.close() } catch (e) { }
    }
  })

  return (
    <div class="h-full">
      {gameType() === 'set' && <SetGame socket={socket} id={props.id} initialData={initialData} />}
      {gameType() === 'anagrams' && <Anagrams socket={socket} id={props.id} initialData={initialData} />}
      {gameType() === null && (
        <div class="p-8 text-center text-gray-600">Loading game…</div>
      )}
    </div>
  )
}
