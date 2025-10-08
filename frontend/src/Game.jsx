import { onCleanup, createSignal, For, createEffect } from 'solid-js'
import SetBoard from './SetBoard'
import GameOverModal from './GameOverModal'
import { navigate } from './utils/test.js'

export default function Game(props) {
  const [messages, setMessages] = createSignal([])
  const [isChatOpen, setIsChatOpen] = createSignal(false)
  const [gameState, setGameState] = createSignal(null)
  const [showGameOver, setShowGameOver] = createSignal(false)
  let socket = null
  let messagesEndRef

  // Auto-scroll to bottom when messages change
  createEffect(() => {
    const msgs = messages() // Track messages signal
    if (messagesEndRef && msgs.length > 0) {
      // Use setTimeout to ensure DOM is updated
      setTimeout(() => {
        messagesEndRef.scrollIntoView({ behavior: 'smooth', block: 'end' })
      }, 0)
    }
  })

  // Helper function to get card image URL (same as in SetBoard)
  const getCardImageUrl = (cardArray) => {
    const shapes = ['oval', 'squiggle', 'diamond']
    const fillings = ['filled', 'lines', 'clear']
    const colors = ['red', 'green', 'purple']
    const numbers = ['1', '2', '3']

    const shape = shapes[cardArray[0]]
    const filling = fillings[cardArray[1]]
    const color = colors[cardArray[2]]
    const number = numbers[cardArray[3]]

    return `https://set.gganeles.com/RegCards/${shape}_${filling}_${color}_${number}.png`
  }

  function handleMessage(e) {
    try {
      const data = JSON.parse(e.data)

      // Handle different message types
      if (data.kind === 'init') {
        // Parse initial game state and load chat history
        try {
          const gameData = JSON.parse(data.data)
          console.log('Init game data:', gameData)
          console.log('Chat history:', gameData.chat)

          if (gameData.chat && Array.isArray(gameData.chat)) {
            // Convert chat history to message format
            // Chat is now an array of {sender, text, cards} objects
            const chatMessages = gameData.chat.map(msg => ({
              sender: msg.sender,
              text: msg.text,
              isSystem: msg.sender === 'System',
              cards: msg.cards || undefined
            }))
            console.log('Loading chat messages:', chatMessages)
            setMessages(chatMessages)
          }
        } catch (err) {
          console.error('Error parsing init:', err)
        }
      } else if (data.kind === 'player_joined') {
        // Update game state when a player joins
        try {
          const gameData = JSON.parse(data.data)
          console.log('Player joined, updated game data:', gameData)
          // Update the game state which includes the players list
          handleGameStateUpdate(gameData)
        } catch (err) {
          console.error('Error parsing player_joined:', err)
        }
      } else if (data.kind === 'chat') {
        // Parse chat data which might be JSON with sender info or just text
        try {
          const chatData = JSON.parse(data.data)
          if (chatData.sender && chatData.message) {
            setMessages(prev => [...prev, { sender: chatData.sender, text: chatData.message }])
          } else {
            // Fallback if structure is different
            setMessages(prev => [...prev, { sender: 'Unknown', text: data.data }])
          }
        } catch {
          // If data.data is just a string
          setMessages(prev => [...prev, { sender: 'Player', text: data.data }])
        }
      } else if (data.kind === 'set_found') {
        // Parse game state to show previous set and updated chat
        try {
          const gameData = JSON.parse(data.data)
          console.log('Set found data:', gameData)

          // Update messages with the full chat history
          if (gameData.chat && Array.isArray(gameData.chat)) {
            const chatMessages = gameData.chat.map(msg => ({
              sender: msg.sender,
              text: msg.text,
              isSystem: msg.sender === 'System',
              cards: msg.cards || undefined
            }))
            setMessages(chatMessages)
          }
        } catch (err) {
          console.error('Error parsing set_found:', err)
        }
      }
    } catch (err) {
      console.error('Error parsing message:', err)
    }
  }

  function connect(id) {
    if (socket) {
      try { socket.close() } catch (e) { }
    }
    // Use current host and determine ws/wss based on protocol
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    // Get hostname without port, then add backend port
    const hostname = window.location.hostname || '127.0.0.1'
    const wsUrl = `${protocol}//${hostname}:3030/game/ws/${id}`
    socket = new WebSocket(wsUrl)
    socket.addEventListener('message', handleMessage)
    socket.addEventListener('open', () => {
      console.log(`connected to game ${id}`)
      // Send join_player message to add this player to the game
      const playerName = localStorage.getItem('rs_name') || 'Anonymous'
      const joinMsg = {
        kind: 'join_player',
        data: JSON.stringify({ name: playerName })
      }
      socket.send(JSON.stringify(joinMsg))
    })
    socket.addEventListener('close', () => console.log('disconnected from game'))
    socket.addEventListener('error', (err) => {
      console.error('WebSocket error:', err)
    })
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
    
    // Check if game is over
    if (newGameState && newGameState.game_state && newGameState.game_state.current_state === 'game_over') {
      setShowGameOver(true)
    }
  }

  function sendChat(e) {
    e.preventDefault()
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    const text = input().trim()
    if (text === '') return
    const senderName = localStorage.getItem('rs_name') || 'Anonymous'
    const chatData = JSON.stringify({ sender: senderName, message: text })
    const msg = { kind: 'chat', data: chatData }
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
      <div class="flex items-center justify-between px-4 py-2 bg-white border-b shadow-sm flex-shrink-0 flex-wrap gap-4">

        {/* Scoreboard in header */}
        {gameState() && gameState().game_state && gameState().game_state.players && (<>
          <h2 class="text-lg font-semibold whitespace-nowrap">{gameState().game_state.name}</h2>
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
        </>)}

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
              <li key={i} class={`text-sm p-2 rounded ${m.isSystem ? 'bg-green-50 border border-green-200' : 'bg-gray-50 text-gray-800'}`}>
                <div class="font-semibold">{m.sender}:</div>
                <div>{m.text}</div>
                {m.cards && m.cards.length > 0 && (
                  <div class="flex gap-1 mt-2 flex-wrap">
                    <For each={m.cards}>
                      {(card) => (
                        <div class="w-16 h-28 p-1 py-2 bg-white rounded-[15px] border border-gray-300 shadow-sm flex justify-center items-center">
                          <img
                            src={getCardImageUrl(card.array)}
                            alt="Set card"
                            class="object-contain"
                          />
                        </div>
                      )}
                    </For>
                  </div>
                )}
              </li>
            ))}
            {/* Invisible element to scroll to */}
            <div ref={messagesEndRef}></div>
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

      {/* Game Over Modal */}
      {showGameOver() && gameState() && gameState().game_state && gameState().game_state.players && (
        <GameOverModal
          players={gameState().game_state.players}
          onClose={() => setShowGameOver(false)}
        />
      )}
    </div>
  )
}
