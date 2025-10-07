import { onCleanup, createSignal, For } from 'solid-js'
import SetBoard from './SetBoard'
import { navigate } from './utils/test.js'

export default function Game(props) {
  const [messages, setMessages] = createSignal([])
  const [isChatOpen, setIsChatOpen] = createSignal(false)
  const [roomName, setRoomName] = createSignal('')
  const [gameState, setGameState] = createSignal(null)
  let socket = null

  function handleMessage(e) {
    try {
      const data = JSON.parse(e.data)
      setMessages(prev => [...prev, `${data.kind}: ${data.data}`])
    } catch (err) {
      setMessages(prev => [...prev, e.data])
    }
  }

  function connect(id) {
    if (socket) {
      try { socket.close() } catch (e) { }
    }
    socket = new WebSocket(`ws://127.0.0.1:3030/game/ws/${id}`)
    socket.addEventListener('message', handleMessage)
    socket.addEventListener('open', () => setMessages(prev => [...prev, `connected to game ${id}`]))
    socket.addEventListener('close', () => setMessages(prev => [...prev, 'disconnected from game']))
  }

  // connect on mount
  connect(props.id)

  onCleanup(() => {
    if (socket) {
      try { socket.close() } catch (e) { }
    }
  })

  const [input, setInput] = createSignal('')

  function handleGameStateUpdate(newGameState) {
    setGameState(newGameState)
  }

  function sendChat(e) {
    e.preventDefault()
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    const text = input().trim()
    if (text === '') return
    const msg = { kind: 'chat', data: text }
    socket.send(JSON.stringify(msg))
    setInput('')
  }

  function closeChat(e) {
    e?.preventDefault()
    e?.stopPropagation()
    setIsChatOpen(false)
  }

  return (
    <div class="h-full flex flex-col">
      {/* Compact Header with scoreboard and buttons */}
      <div class="flex items-center justify-between px-4 py-2 bg-white border-b shadow-sm flex-shrink-0 gap-4">
        <h2 class="text-lg font-semibold whitespace-nowrap">Game {roomName()}</h2>

        {/* Scoreboard in header */}
        {gameState() && gameState().game_state && gameState().game_state.players && (
          <div class="flex flex-wrap gap-2 flex-1 justify-center">
            <For each={gameState().game_state.players}>
              {(player) => (
                <div class="flex items-center gap-2 px-2 py-1 bg-gray-50 rounded text-sm">
                  <span class="font-medium text-gray-800">{player.name}</span>
                  <span class="font-bold text-blue-600">{player.score}</span>
                </div>
              )}
            </For>
          </div>
        )}

        <div class='flex flex-row items-center gap-2 whitespace-nowrap'>
          <button class="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300" onClick={() => navigate('/')}>Back to Lobby</button>

          <button
            onClick={() => setIsChatOpen(!isChatOpen())}
            class="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-2"
          >
            <span>{isChatOpen() ? 'Hide Chat' : 'Show Chat'}</span>
            <span>{isChatOpen() ? '→' : '←'}</span>
          </button>
        </div>
      </div>

      {/* Main content area - fills remaining space */}
      <div class="relative flex-1 overflow-hidden">
        {/* Game board - fills available space, no margin needed */}
        <div class="h-full overflow-auto">
          <SetBoard socket={socket} onGameStateUpdate={handleGameStateUpdate} />
        </div>
      </div>

      {/* Chat sidebar - renders separately on top */}
      <div
        class={`fixed top-0 right-0 h-full w-80 bg-white shadow-2xl border-l transform transition-transform duration-300 flex flex-col z-50 ${isChatOpen() ? 'translate-x-0' : 'translate-x-full'
          }`}
      >
          {/* Chat header */}
          <div class="flex items-center justify-between p-4 border-b bg-gray-50">
            <h3 class="font-semibold text-lg">Chat</h3>
            <button
              onClick={closeChat}
              class="text-gray-600 hover:text-gray-900 text-xl font-bold leading-none px-2"
              type="button"
            >
              ×
            </button>
          </div>

          {/* Messages */}
          <div class="flex-1 overflow-auto p-4">
            <ul class="space-y-2">
              {messages().map((m, i) => (
                <li key={i} class="text-sm text-gray-800 p-2 bg-gray-50 rounded">{m}</li>
              ))}
            </ul>
          </div>

          {/* Chat input */}
          <div class="p-4 border-t bg-white">
            <form onSubmit={sendChat} class="flex flex-col gap-2">
              <input
                class="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={input()}
                onInput={(e) => setInput(e.target.value)}
                placeholder="Type a message..."
              />
              <button
                type="submit"
                class="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Send
              </button>
            </form>
          </div>
        </div>
    </div>
  )
}
