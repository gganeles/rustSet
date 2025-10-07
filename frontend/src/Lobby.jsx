import { createSignal, onCleanup, onMount } from 'solid-js'
import NameModal from './NameModal'
import { navigate } from './utils/test.js'

export default function Lobby(props) {
  const [games, setGames] = createSignal([])
  const [name, setName] = createSignal('')
  const [creator, setCreator] = createSignal('')
  const [showNameModal, setShowNameModal] = createSignal(true)
  const [nameError, setNameError] = createSignal('')
  const [gameError, setGameError] = createSignal('')
  const [infoMessage, setInfoMessage] = createSignal('')
  let socket = null

  function handleMessage(e) {
    try {
      const data = JSON.parse(e.data)
      if (data.kind === 'games_list') {
        try { setGames(JSON.parse(data.data)) } catch (err) { }
      }
    } catch (err) {
      // ignore
    }
  }

  function connect() {
    if (socket) { try { socket.close() } catch (e) { } }
    socket = new WebSocket('ws://127.0.0.1:3030/lobby')
    socket.addEventListener('message', handleMessage)
    socket.addEventListener('open', () => {
      const msg = { kind: 'list_games', data: '' }
      socket.send(JSON.stringify(msg))
    })
  }

  // Attempt to read saved name and prefill creator. If not present, show modal.
  onMount(() => {
    try {
      const saved = localStorage.getItem('rs_name')
      if (saved && saved.length > 0) {
        setCreator(saved)
        setShowNameModal(false)
      } else {
        setShowNameModal(true)
      }
    } catch (e) {
      setShowNameModal(true)
    }

    // connect after mount
    connect()
  })

  onCleanup(() => { if (socket) try { socket.close() } catch (e) { } })

  function createGame(e) {
    e && e.preventDefault()
    if (!creator() || creator().trim() === '') {
      setNameError('Please set your name first')
      return
    }
    if (!name() || name().trim() === '') {
      setGameError('Please enter a game name')
      return
    }
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    const payload = { name: name(), creator: creator() }
    socket.send(JSON.stringify({ kind: 'create_game', data: JSON.stringify(payload) }))
    setName('')
    setGameError('')
  }

  function handleSaveName(val) {
    const v = (val || '').trim()
    if (!v) return
    try { localStorage.setItem('rs_name', v) } catch (e) { }
    setCreator(v)
    setShowNameModal(false)
    setNameError('')
    setInfoMessage('Name saved')
    setTimeout(() => setInfoMessage(''), 3000)
  }

  function joinGame(id) {
    // notify server and navigate
    if (socket && socket.readyState === WebSocket.OPEN) {
      const payload = { id, player: creator() || 'anonymous' }
      socket.send(JSON.stringify({ kind: 'join_game', data: JSON.stringify(payload) }))
    }

    navigate(`/game/${id}`)
    props.onJoin(id)
  }

  function deleteGame(id) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    const payload = { id }
    socket.send(JSON.stringify({ kind: 'delete_game', data: JSON.stringify(payload) }))
  }

  function changeName(e) {
    e && e.preventDefault()
    const v = creator().trim()
    if (!v) {
      setNameError('Please enter a name')
      return
    }
    handleSaveName(creator())
  }

  return (
    <div>
      {showNameModal() && (
        <NameModal prefill={creator()} onSave={handleSaveName} />
      )}

      <form onSubmit={changeName} class="flex flex-wrap items-center gap-2 mb-6">
        <input class="px-3 py-2 border rounded w-48" placeholder="your name" value={creator()} onInput={(e) => setCreator(e.target.value)} />
        <button type="submit" class="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Change Name</button>
        <div>
          {nameError() && <span class="text-red-600">{nameError()}</span>}
        </div>
        <div>
          {infoMessage() && <span class="text-green-600">{infoMessage()}</span>}
        </div>
      </form>

      <form onSubmit={createGame} class="flex flex-wrap items-center gap-2 mb-6">
        <input class="px-3 py-2 border rounded flex-1 min-w-[160px]" placeholder="game name" value={name()} onInput={(e) => setName(e.target.value)} />
        <button type="submit" class="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Create Game</button>
        <div>
          {gameError() && <span class="text-red-600">{gameError()}</span>}
        </div>
      </form>

      <h2 class="text-lg font-medium mb-2">Available games</h2>
      <ul class="space-y-2">
        {games().length === 0 ? <li class="text-gray-600">No games</li> : games().map((g, i) => (
          <li key={i} class="flex items-center justify-between gap-4 p-3 border rounded">
            <div class="text-gray-800">{g.name} <span class="text-sm text-gray-500">— by {g.creator} ({g.players_online} players)</span></div>
            <div class="flex gap-2">
              <button class="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700" onClick={() => joinGame(g.id)}>Join</button>
              <button class="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700" onClick={() => deleteGame(g.id)}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
