import { onCleanup, createSignal } from 'solid-js'
import SetBoard from './SetBoard'

export default function Game(props) {
  const [messages, setMessages] = createSignal([])
  const [isChatOpen, setIsChatOpen] = createSignal(false)
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

  function sendChat(e) {
    e.preventDefault()
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    const text = input().trim()
    if (text === '') return
    const msg = { kind: 'chat', data: text }
    socket.send(JSON.stringify(msg))
    setInput('')
  }

  return (
    <div class="relative">
      {/* Header with toggle button */}
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-semibold">Game {props.id}</h2>
        <button
          onClick={() => setIsChatOpen(!isChatOpen())}
          class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-2"
        >
          <span>{isChatOpen() ? 'Hide Chat' : 'Show Chat'}</span>
          <span>{isChatOpen() ? '→' : '←'}</span>
        </button>
      </div>

      {/* Main content area */}
      <div class="relative">
        {/* Game board */}
        <div class={`transition-all duration-300 ${isChatOpen() ? 'mr-80' : ''}`}>
          <SetBoard socket={socket} />
        </div>

        {/* Chat sidebar */}
        <div
          class={`fixed top-0 right-0 h-full w-80 bg-white shadow-2xl border-l transform transition-transform duration-300 flex flex-col ${isChatOpen() ? 'translate-x-0' : 'translate-x-full'
            }`}
        >
          {/* Chat header */}
          <div class="flex items-center justify-between p-4 border-b bg-gray-50">
            <h3 class="font-semibold text-lg">Chat</h3>
            <button
              onClick={() => setIsChatOpen(false)}
              class="text-gray-600 hover:text-gray-900 text-xl font-bold"
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
    </div>
  )
}
