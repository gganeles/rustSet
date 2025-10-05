import { createSignal, onCleanup } from 'solid-js'

export default function Lobby(props) {
  const [games, setGames] = createSignal([])
  const [name, setName] = createSignal('')
  const [creator, setCreator] = createSignal('')
  let socket = null

  function handleMessage(e) {
    try {
      const data = JSON.parse(e.data)
      if (data.kind === 'games_list') {
        try { setGames(JSON.parse(data.data)) } catch (err) {}
      }
    } catch (err) {
      // ignore
    }
  }

  function connect() {
    if (socket) { try { socket.close() } catch (e) {} }
    socket = new WebSocket('ws://127.0.0.1:3030/lobby')
    socket.addEventListener('message', handleMessage)
    socket.addEventListener('open', () => {
      const msg = { kind: 'list_games', data: '' }
      socket.send(JSON.stringify(msg))
    })
  }

  connect()

  onCleanup(() => { if (socket) try { socket.close() } catch (e) {} })

  function createGame(e) {
    e.preventDefault()
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    const payload = { name: name(), creator: creator() }
    socket.send(JSON.stringify({ kind: 'create_game', data: JSON.stringify(payload) }))
    setName('')
    setCreator('')
  }

  function joinGame(id) {
    // notify server and navigate
    if (socket && socket.readyState === WebSocket.OPEN) {
      const payload = { id, player: creator() || 'anonymous' }
      socket.send(JSON.stringify({ kind: 'join_game', data: JSON.stringify(payload) }))
    }
    props.onJoin(id)
  }

  return (
    <div>
      <form onSubmit={createGame} style={{ margin: '0 0 1rem 0' }}>
        <input placeholder="game name" value={name()} onInput={(e) => setName(e.target.value)} />
        <input placeholder="your name" value={creator()} onInput={(e) => setCreator(e.target.value)} style={{ margin: '0 0 0 0.5rem' }} />
        <button type="submit" style={{ margin: '0 0 0 0.5rem' }}>Create Game</button>
      </form>

      <h2>Available games</h2>
      <ul>
        {games().length === 0 ? <li>No games</li> : games().map((g, i) => (
          <li key={i} style={{ display: 'flex', 'align-items': 'center', gap: '0.5rem' }}>
            <span>{g.name} — by {g.creator} ({g.players_online} players)</span>
            <button onClick={() => joinGame(g.id)}>Join</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
