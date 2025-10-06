import { onCleanup, createSignal } from 'solid-js'
import SetBoard from './SetBoard'

export default function Game(props) {
  const [messages, setMessages] = createSignal([])
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
    <div class="space-y-4">
      <h2 class="text-xl font-semibold">Game {props.id}</h2>

      <ul class="space-y-1 max-h-64 overflow-auto p-2 border rounded bg-white">
        {messages().map((m, i) => (
          <li key={i} class="text-sm text-gray-800">{m}</li>
        ))}
      </ul>

      <form onSubmit={sendChat} class="flex gap-2">
        <input class="flex-1 px-3 py-2 border rounded" value={input()} onInput={(e) => setInput(e.target.value)} placeholder="Type a message and press Enter" />
        <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Send</button>
      </form>

      <SetBoard socket={socket} />
    </div>
  )
}
