import { onCleanup, createSignal, For, createEffect, onMount } from 'solid-js'
import GameOverModal from './GameOverModal'
import { navigate } from './utils/test.js'

export default function Anagrams(props) {
    const socket = props.socket || null
    const [messages, setMessages] = createSignal([])
    const [gameState, setGameState] = createSignal(null)
    const [showGameOver, setShowGameOver] = createSignal(false)
    const [input, setInput] = createSignal('')
    let messagesEndRef
    let inlineChatRef

    createEffect(() => {
        const msgs = messages()
        if (messagesEndRef && msgs.length > 0) {
            // scroll inline chat
            setTimeout(() => {
                try {
                    if (inlineChatRef) inlineChatRef.scrollTop = inlineChatRef.scrollHeight
                } catch (e) { }
                try { messagesEndRef.scrollIntoView({ behavior: 'smooth', block: 'end' }) } catch (e) { }
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
                    const text = chatData.message || data.data
                    const isSystem = sender === 'System'
                    const messageType = chatData.message_type || 'info'
                    setMessages(prev => [...prev, { sender, text, isSystem, messageType }])
                } catch {
                    setMessages(prev => [...prev, { sender: 'Player', text: data.data, isSystem: false, messageType: 'info' }])
                }
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
        // attempts are shown in chat by the server; no client-side error banner
        // player id lookup
        const playerName = localStorage.getItem('rs_name') || 'Anonymous'
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
        <div class="h-full flex flex-col bg-gray-50">
            {/* App bar (Material-like) */}
            <header class="w-full bg-white shadow-md py-2 px-3 md:py-3 md:px-4 flex items-center justify-between">
                <div class="flex items-center gap-2 md:gap-4">
                    <button onClick={() => navigate('/')} class="rounded-full p-1.5 md:p-2 hover:bg-gray-100">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 md:h-6 md:w-6 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <div>
                        <div class="text-xs md:text-sm text-gray-500">Game</div>
                        <div class="text-base md:text-lg font-medium text-gray-900">{gameState() && gameState().game_state ? gameState().game_state.name : 'Anagrams'}</div>
                    </div>
                </div>
            </header>

            <main class="p-3 md:p-6 flex-1 overflow-auto">
                {/* Enemy Boards */}
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-6 mb-4 md:mb-8">
                    {(() => {
                        const boards = (gameState() && gameState().players_boards) ? gameState().players_boards : []
                        const meName = localStorage.getItem('rs_name') || ''
                        return boards
                            .filter(pb => pb.player && pb.player.name && pb.player.name !== meName)
                            .map(pb => (
                                <div class="bg-white rounded-lg shadow-sm p-3 md:p-4">
                                    <div class="text-xs md:text-sm text-gray-600 mb-2">{pb.player.name}</div>
                                    <div class="flex flex-wrap gap-2 md:gap-4">
                                        {pb.words && pb.words.length > 0 ? (
                                            pb.words.map((word, wordIdx) => (
                                                <div key={wordIdx} class="flex gap-0.5 md:gap-2">
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
                            <div class="w-10 h-10 md:w-16 md:h-16 bg-orange-100 rounded-lg border-2 border-orange-200 shadow-md flex items-center justify-center text-lg md:text-2xl font-bold">{ch}</div>
                        )) : <div class="text-gray-500 text-sm">(empty)</div>}
                    </div>
                </div>

                {/* Player Board, Chat, and Attempt Input */}
                <div class="flex flex-col w-full gap-3 md:gap-6 items-start">
                    <div class="w-full">
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
                    </div>

                    {/* Chat (recent messages) - moved above the attempt input */}
                    <div class="w-full mb-2 md:mb-4">
                        <div ref={el => inlineChatRef = el} class="p-2 md:p-3 rounded h-32 md:h-40 overflow-auto bg-white shadow-inner">
                            <ul class="space-y-2 md:space-y-3 p-0.5 md:p-1">
                                {messages().map((m, i) => {
                                    const bgColor = m.messageType === 'success'
                                        ? 'bg-green-50 border border-green-100 text-green-800'
                                        : m.messageType === 'error'
                                            ? 'bg-red-50 border border-red-100 text-red-800'
                                            : m.isSystem
                                                ? 'bg-blue-50 border border-blue-100 text-blue-800'
                                                : 'bg-gray-50 border border-gray-100 text-gray-900'
                                    return (
                                        <li key={i} class="flex items-start gap-2 md:gap-3">
                                            <div class="w-6 h-6 md:w-8 md:h-8 rounded-full bg-indigo-100 text-indigo-800 flex items-center justify-center text-xs font-semibold flex-shrink-0">{(m.sender || 'P').charAt(0).toUpperCase()}</div>
                                            <div class={`rounded-lg px-2 py-1.5 md:px-3 md:py-2 ${bgColor} shadow-sm flex-1 min-w-0`}>
                                                <div class="text-xs font-semibold mb-0.5 md:mb-1">{m.sender}</div>
                                                <div class="text-xs md:text-sm break-words">{m.text}</div>
                                            </div>
                                        </li>
                                    )
                                })}
                                <div ref={messagesEndRef}></div>
                            </ul>
                        </div>
                    </div>

                    {/* Attempt input */}
                    <div class="w-full md:max-w-xl md:mx-auto">
                        <form onSubmit={submitAttempt} class="flex gap-2 items-center">
                            <label class="flex-1">
                                <div class="relative">
                                    <input class="w-full px-3 py-2 md:px-4 md:py-3 rounded-md bg-gray-100 border border-transparent focus:border-indigo-300 focus:shadow-outline text-sm" placeholder="Type word..." value={input()} onInput={(e) => setInput(e.target.value)} />
                                </div>
                            </label>
                            <button class="px-3 py-2 md:px-4 md:py-2 bg-indigo-600 text-white rounded-md shadow-md hover:bg-indigo-700 text-sm md:text-base" type="submit">Submit</button>
                        </form>
                    </div>
                </div>
            </main>

            {showGameOver() && gameState() && gameState().game_state && gameState().game_state.players && (
                <GameOverModal players={gameState().game_state.players} onClose={() => setShowGameOver(false)} />
            )}
        </div>
    )
}
