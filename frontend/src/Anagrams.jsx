import { onCleanup, createSignal, For, createEffect, onMount } from 'solid-js'
import AnagramsGameOverModal from './AnagramsGameOverModal'
import { navigate } from './utils/test.js'

export default function Anagrams(props) {
    const socket = props.socket || null
    const [messages, setMessages] = createSignal([])
    const [gameState, setGameState] = createSignal(null)
    const [showGameOver, setShowGameOver] = createSignal(false)
    const [input, setInput] = createSignal('')
    const [isChatOpen, setIsChatOpen] = createSignal(false)
    let messagesEndRef
    let inlineChatRef
    let inlineChatScrollRef

    createEffect(() => {
        const msgs = messages()
        if (msgs.length > 0) {
            // scroll both inline chat and sidebar chat
            setTimeout(() => {
                try {
                    if (inlineChatScrollRef) inlineChatScrollRef.scrollTop = inlineChatScrollRef.scrollHeight
                } catch (e) { }
                try {
                    if (inlineChatRef) inlineChatRef.scrollTop = inlineChatRef.scrollHeight
                } catch (e) { }
                try {
                    if (messagesEndRef) messagesEndRef.scrollIntoView({ behavior: 'smooth', block: 'end' })
                } catch (e) { }
            }, 0)
        }
    })

    function handleMessage(e) {
        try {
            const data = JSON.parse(e.data)
            if (data.kind === 'init') {
                try {
                    const gameData = JSON.parse(data.data)
                    if (gameData.chat && Array.isArray(gameData.chat)) {
                        const chatMessages = gameData.chat.map(msg => {
                            const isSystem = msg.sender === 'System'
                            // Only default to 'info' for non-system messages
                            const messageType = msg.message_type || (isSystem ? 'system' : 'info')
                            return {
                                sender: msg.sender,
                                text: msg.text,
                                isSystem: isSystem,
                                messageType: messageType
                            }
                        })
                        setMessages(chatMessages)
                    }
                    setGameState(gameData)
                } catch (err) { console.error('Error parsing init in Anagrams:', err) }
            } else if (data.kind === 'anagram_complete') {
                try {
                    const payload = JSON.parse(data.data)
                    // payload likely contains updated state and chat
                    if (payload.chat && Array.isArray(payload.chat)) {
                        const chatMessages = payload.chat.map(msg => {
                            const isSystem = msg.sender === 'System'
                            const messageType = msg.message_type || (isSystem ? 'system' : 'info')
                            return {
                                sender: msg.sender,
                                text: msg.text,
                                isSystem: isSystem,
                                messageType: messageType
                            }
                        })
                        setMessages(chatMessages)
                    }
                    setGameState(payload)
                } catch (err) { console.error('Error parsing anagram_complete:', err) }
            } else if (data.kind === 'player_joined' || data.kind === 'player_left') {
                // Server sends the updated game state when a player joins or leaves.
                try {
                    const gameData = JSON.parse(data.data)
                    if (gameData.chat && Array.isArray(gameData.chat)) {
                        const chatMessages = gameData.chat.map(msg => {
                            const isSystem = msg.sender === 'System'
                            const messageType = msg.message_type || (isSystem ? 'system' : 'info')
                            return {
                                sender: msg.sender,
                                text: msg.text,
                                isSystem: isSystem,
                                messageType: messageType
                            }
                        })
                        setMessages(chatMessages)
                    }
                    setGameState(gameData)
                    // also add a small system message if chat didn't include one
                    try {
                        const last = (gameData.chat && gameData.chat.length) ? gameData.chat[gameData.chat.length - 1] : null
                        if (!last || last.sender !== 'System') {
                            const who = data.kind === 'player_joined' ? 'joined' : 'left'
                            setMessages(prev => [...prev, { sender: 'System', text: `A player ${who} the game.`, isSystem: true, messageType: 'system' }])
                        }
                    } catch (e) { /* ignore */ }
                } catch (err) { console.error('Error parsing player_joined/player_left in Anagrams:', err) }
            } else if (data.kind === 'chat') {
                try {
                    const chatData = JSON.parse(data.data)
                    const sender = chatData.sender || 'Player'
                    const text = chatData.text || chatData.message || data.data
                    const isSystem = sender === 'System'
                    const messageType = chatData.message_type || 'info'
                    setMessages(prev => [...prev, { sender, text, isSystem, messageType }])
                } catch {
                    setMessages(prev => [...prev, { sender: 'Player', text: data.data, isSystem: false, messageType: 'info' }])
                }
            } else if (data.kind === 'game_over') {
                // Server sent game_over - update state and show modal
                try {
                    const gameData = JSON.parse(data.data)
                    if (gameData.chat && Array.isArray(gameData.chat)) {
                        const chatMessages = gameData.chat.map(msg => {
                            const isSystem = msg.sender === 'System'
                            const messageType = msg.message_type || (isSystem ? 'system' : 'info')
                            return {
                                sender: msg.sender,
                                text: msg.text,
                                isSystem: isSystem,
                                messageType: messageType
                            }
                        })
                        setMessages(chatMessages)
                    }
                    setGameState(gameData)
                    // Show the game over modal
                    if (gameData.game_state && gameData.game_state.current_state === 'game_over') {
                        setShowGameOver(true)
                    }
                } catch (err) { console.error('Error parsing game_over:', err) }
            } else if (data.kind === 'challenge_started' || data.kind === 'challenge_resolved' || data.kind === 'paused' || data.kind === 'resumed') {
                // Handle challenge and pause state changes
                try {
                    const gameData = JSON.parse(data.data)
                    if (gameData.chat && Array.isArray(gameData.chat)) {
                        const chatMessages = gameData.chat.map(msg => {
                            const isSystem = msg.sender === 'System'
                            const messageType = msg.message_type || (isSystem ? 'system' : 'info')
                            return {
                                sender: msg.sender,
                                text: msg.text,
                                isSystem: isSystem,
                                messageType: messageType
                            }
                        })
                        setMessages(chatMessages)
                    }
                    setGameState(gameData)
                    // Update challenge state
                    if (gameData.game_state && gameData.game_state.current_state === 'challenge') {
                        setIsChallengeActive(true)
                    } else {
                        setIsChallengeActive(false)
                    }
                } catch (err) { console.error('Error parsing challenge/pause state:', err) }
            } else if (data.kind === 'new_tile') {
                // server sends the new pot (array of chars) as JSON in data.data
                try {
                    const pot = JSON.parse(data.data)
                    // update local gameState pot if present
                    setGameState(prev => {
                        if (!prev) return prev
                        try {
                            const next = { ...prev, pot }
                            return next
                        } catch (e) { return prev }
                    })
                } catch (err) { console.error('Error parsing new_tile:', err) }
            }
        } catch (err) { console.error('Error parsing message in Anagrams:', err) }
    }

    onMount(() => {
        if (socket) socket.addEventListener('message', handleMessage)
    })

    createEffect(() => {
        const init = typeof props.initialData === 'function' ? props.initialData() : props.initialData
        if (!init) return
        try {
            const gameData = init
            if (gameData.chat && Array.isArray(gameData.chat)) {
                const chatMessages = gameData.chat.map(msg => ({ sender: msg.sender, text: msg.text, isSystem: msg.sender === 'System' }))
                setMessages(chatMessages)
            }
            setGameState(gameData)
        } catch (err) { console.error('Error initializing Anagrams from initialData:', err) }
    })

    onCleanup(() => {
        if (socket) {
            try { socket.removeEventListener('message', handleMessage) } catch (e) { }
        }
    })

    function submitAttempt(e) {
        e.preventDefault()
        if (!socket || socket.readyState !== WebSocket.OPEN) return
        const word = input().trim()
        if (!word) return

        const playerName = localStorage.getItem('rs_name') || 'Anonymous'

        // Check if the message starts with "/" for commands (like /gameover)
        if (word.startsWith('/')) {
            // Send as chat message (which will be handled as a command on the server)
            const chatData = JSON.stringify({ sender: playerName, message: word })
            const msg = { kind: 'chat', data: chatData }
            socket.send(JSON.stringify(msg))
            setInput('')
            return
        }

        // Otherwise, treat as anagram attempt
        // player id lookup
        let playerId = null
        if (gameState() && gameState().game_state && gameState().game_state.players) {
            const player = gameState().game_state.players.find(p => p.name === playerName)
            if (player) playerId = player.id
        }
        const payload = { kind: 'anagram_attempt', data: word, player_id: playerId }
        socket.send(JSON.stringify(payload))
        setInput('')
    }

    const pot = () => (gameState() && gameState().pot) ? gameState().pot.join(' ') : ''

    return (
        <div class="h-full flex flex-col md:flex-row">
            {/* Main Content Area */}
            <div class="flex-1 flex flex-col min-w-0">
                {/* App bar (Material-like) */}
                <header class="w-full bg-white shadow-md z-10 py-2 px-3 md:py-3 md:px-4 flex items-center justify-between">
                    <div class="flex items-center gap-2 md:gap-4">
                        <button onClick={() => navigate('/')} class="rounded-full p-1.5 md:p-2 hover:bg-gray-100">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 md:h-6 md:w-6 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" /></svg>
                        </button>
                        <div>
                            <div class="text-xs md:text-sm text-gray-500">Game</div>
                            <div class="text-base md:text-lg font-medium text-gray-900">{gameState() && gameState().game_state ? gameState().game_state.name : 'Anagrams'}</div>
                        </div>
                    </div>
                    {/* Mobile chat toggle button */}
                    <button
                        onClick={() => setIsChatOpen(!isChatOpen())}
                        class="md:hidden rounded-full p-1.5 hover:bg-gray-100"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-keyboard-icon lucide-keyboard"><path d="M10 8h.01" /><path d="M12 12h.01" /><path d="M14 8h.01" /><path d="M16 12h.01" /><path d="M18 8h.01" /><path d="M6 8h.01" /><path d="M7 16h10" /><path d="M8 12h.01" /><rect width="20" height="16" x="2" y="4" rx="2" /></svg>
                    </button>
                </header>

                <main class="p-3 md:p-6 flex-1 overflow-auto">
                    {/* Enemy Boards */}
                    <div class="flex flex-row flex-wrap gap-3 md:gap-6 mb-4 md:mb-8">
                        {(() => {
                            const boards = (gameState() && gameState().players_boards) ? gameState().players_boards : []
                            const meName = localStorage.getItem('rs_name') || ''
                            return boards
                                .filter(pb => pb.player && pb.player.name && pb.player.name !== meName)
                                .map(pb => (
                                    <div class="bg-white rounded-lg shadow-sm p-3 md:p-4">
                                        <div class="text-xs md:text-sm text-gray-600 mb-2">{pb.player.name}</div>
                                        <div class="flex flex-wrap gap-4 md:gap-6">
                                            {pb.words && pb.words.length > 0 ? (
                                                pb.words.map((word, wordIdx) => (
                                                    <div key={wordIdx} class="flex gap-0.5 md:gap-1">
                                                        {word.split('').map((ch, charIdx) => (
                                                            <div key={charIdx} class="w-5 h-5 md:w-6 md:h-6 bg-orange-100 rounded-sm border-2 border-orange-200 shadow-md flex items-center justify-center text-sm md:text-lg font-bold">{ch}</div>
                                                        ))}
                                                    </div>
                                                ))
                                            ) : (
                                                <div class="text-gray-500 text-sm">(no words)</div>
                                            )}
                                        </div>
                                    </div>
                                ))
                        })()}
                    </div>

                    {/* Pot */}
                    <div class="flex justify-center mb-4 md:mb-10">
                        <div class="flex flex-wrap gap-1.5 md:gap-3 justify-center">
                            {(gameState() && gameState().pot) ? gameState().pot.map((ch) => (
                                <div class="w-8 h-8 md:w-12 md:h-12 bg-orange-100 rounded-lg border-2 border-orange-200 shadow-md flex items-center justify-center text-lg md:text-2xl font-bold">{ch}</div>
                            )) : <div class="text-gray-500 text-sm">(empty)</div>}
                        </div>
                    </div>

                    {/* Player Board */}
                    <div class="w-full mb-4 md:mb-6">
                        <div class="bg-white rounded-lg shadow-sm p-3 md:p-4 min-h-[80px] md:min-h-[120px]">
                            <div class="flex flex-wrap gap-4 md:gap-8">
                                {(() => {
                                    const boards = (gameState() && gameState().players_boards) ? gameState().players_boards : []
                                    const meName = localStorage.getItem('rs_name') || ''
                                    const myBoard = boards.find(pb => pb.player && pb.player.name === meName)
                                    if (!myBoard || !myBoard.words || myBoard.words.length === 0) return <div class="text-gray-500 text-sm">(no words)</div>
                                    // render each word as its own div with tiles inside
                                    return myBoard.words.map((word, wordIdx) => (
                                        <div key={wordIdx} class="flex gap-0.5">
                                            {word.split('').map((ch, charIdx) => (
                                                <div key={charIdx} class="w-5 h-5 md:w-6 md:h-6 bg-orange-100 rounded-sm border-2 border-orange-200 shadow-md flex items-center justify-center text-sm md:text-lg font-bold">{ch}</div>
                                            ))}
                                        </div>
                                    ))
                                })()}
                            </div>

                        </div>
                        {/*inline two message chat*/}
                        <div class="flex flex-col mt-1 md:hidden">
                            <div ref={el => inlineChatScrollRef = el} class="h-16 overflow-auto">
                                <ul class="space-y-1">
                                    {messages().map((m, i) => (
                                        <li key={i} class={m.isSystem ? "text-gray-500 italic underline text-sm" : "text-sm"}>
                                            {m.isSystem ? (
                                                <span>{m.text}</span>
                                            ) : (
                                                <span><span class="font-semibold">{m.sender}:</span> {m.text}</span>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            {/*inline chat*/}
                            <form onSubmit={submitAttempt} class="flex items-center mt-2">
                                <input type="text" value={input()} onInput={e => setInput(e.target.value)} class="border border-gray-300 rounded-md p-2 mr-2 flex-1" placeholder="Type your message..." />
                                <button type="submit" class="bg-blue-500 text-white rounded-md px-4 py-2">Send</button>
                            </form>
                        </div>
                    </div>
                </main>
            </div>

            {/* Chat Sidebar - Always visible on desktop, toggleable on mobile */}
            <div class={`
                fixed md:relative inset-y-0 right-0 z-40
                w-80 md:w-96
                bg-white border-l border-gray-200 shadow-2xl md:shadow-none
                flex flex-col
                transform transition-transform duration-300 ease-in-out
                ${isChatOpen() ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}
            `}>
                {/* Chat Header */}
                <div class="flex items-center justify-between p-3 md:p-4 border-b border-gray-200 bg-gray-50">
                    <h3 class="font-semibold text-base md:text-lg text-gray-900">Chat</h3>
                    <button
                        onClick={() => setIsChatOpen(false)}
                        class="md:hidden text-gray-500 hover:text-gray-700 p-1"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Chat Messages */}
                <div ref={el => inlineChatRef = el} class="flex-1 overflow-auto p-3 md:p-4">
                    <ul class="space-y-1 md:space-y-1.5">
                        {messages().map((m, i) => (
                            <li key={i} class={m.isSystem ? "text-gray-500 italic underline text-sm" : "text-sm"}>
                                {m.isSystem ? (
                                    <span>{m.text}</span>
                                ) : (
                                    <span><span class="font-semibold">{m.sender}:</span> {m.text}</span>
                                )}
                            </li>
                        ))}
                        <div ref={messagesEndRef}></div>
                    </ul>
                </div>

                {/* Attempt Input at bottom of chat */}
                <div class="border-t border-gray-200 p-3 md:p-4 bg-white">
                    <form onSubmit={submitAttempt} class="flex gap-2 items-center">
                        <label class="flex-1">
                            <input
                                class="w-full px-3 py-2 rounded-md bg-gray-50 border border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none text-sm"
                                placeholder="Type word..."
                                value={input()}
                                onInput={(e) => setInput(e.target.value)}
                            />
                        </label>
                        <button
                            class="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors text-sm font-medium"
                            type="submit"
                        >
                            Submit
                        </button>
                    </form>
                </div>
            </div>

            {/* Mobile overlay when chat is open */}
            {isChatOpen() && (
                <div
                    class="md:hidden fixed inset-0 bg-opacity-0 z-30"
                    onClick={() => setIsChatOpen(false)}
                />
            )}

            {showGameOver() && gameState() && (
                <AnagramsGameOverModal
                    players_boards={(gameState().players_boards && Array.isArray(gameState().players_boards))
                        ? gameState().players_boards
                        : (gameState().game_state && gameState().game_state.players_boards) || []
                    }
                    onClose={() => setShowGameOver(false)}
                />
            )}
        </div>
    )
}
