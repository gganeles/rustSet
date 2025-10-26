import { For, createSignal, onMount, createEffect } from 'solid-js'

export default function SetBoard(props) {
    const socket = props.socket || null
    const onGameStateUpdate = props.onGameStateUpdate || (() => { })
    const [selectedCards, setSelectedCards] = createSignal([])
    const [cards, setCards] = createSignal([])
    const [gameState, setGameState] = createSignal(null)

    // Map card array values to attribute names
    const getCardImageUrl = (cardArray) => {
        // cardArray is [shape, filling, color, number]
        // Each value is 0, 1, or 2
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

    // Function to render the new board from game data
    const renderBoard = (gameData) => {
        // If server wrapped payload as { game: {...}, chat: [...] }, unwrap it
        if (gameData && gameData.game) {
            gameData = gameData.game
        }
        if (!gameData.board) {
            // If this payload looks like an anagrams/game envelope, ignore it
            if (gameData.pot || gameData.bag || gameData.players_boards || (gameData.game_state && !gameData.board)) {
                return
            }
            console.error('No board data found in game data')
            return
        }

        // Extract card arrays from the board
        const boardCards = gameData.board.map(card => card.array)

        // Update the cards state to trigger re-render
        setCards(boardCards)

        // Check if there are any sets on the board
        checkBoardForSets(boardCards)

        // Update game state
        setGameState(gameData)

        // Notify parent component of game state update
        onGameStateUpdate(gameData)
    }

    // Handle incoming messages from the server
    const handleMessage = (e) => {
        try {
            const message = JSON.parse(e.data)

            if (message.kind === 'init') {
                // Parse and render initial game state
                const gameData = JSON.parse(message.data)
                renderBoard(gameData)
            } else if (message.kind === 'set_found') {
                // Parse and render updated board after set was found
                const gameData = JSON.parse(message.data)
                renderBoard(gameData)
            }
        } catch (err) {
            console.error('Error parsing message:', err)
        }
    }

    // Set up message listener when component mounts
    onMount(() => {
        if (socket) {
            socket.addEventListener('message', handleMessage)
        }
        // If initial data was passed (init arrived before mount), render it
        const maybe = typeof props.initialData === 'function' ? props.initialData() : props.initialData
        if (maybe) {
            try {
                renderBoard(maybe)
            } catch (err) {
                console.error('Error initializing SetBoard from initialData:', err)
            }
        }
    })

    // Also react to changes in initialData (covers init arriving after mount)
    createEffect(() => {
        const init = typeof props.initialData === 'function' ? props.initialData() : props.initialData
        if (!init) return
        try {
            renderBoard(init)
        } catch (err) {
            console.error('Error initializing SetBoard from initialData (effect):', err)
        }
    })

    const handleCardClick = (index) => {
        const selected = selectedCards()

        if (selected.includes(index)) {
            // Deselect card if already selected
            setSelectedCards(selected.filter(i => i !== index))
        } else if (selected.length < 3) {
            // Add card to selection if less than 3 cards selected
            const newSelection = [...selected, index]
            setSelectedCards(newSelection)

            // If 3 cards are now selected, send set_attempt to server
            if (newSelection.length === 3) {
                sendSetAttempt(newSelection)
            }
        }
    }

    const setCheck = (cards) => {
        // Check if three cards form a valid set
        const sums = cards[0].map((_, i) => (cards[0][i] + cards[1][i] + cards[2][i]) % 3)
        return sums.every(sum => sum === 0)
    }

    const checkBoardForSets = (board) => {
        const n = board.length
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                for (let k = j + 1; k < n; k++) {
                    if (setCheck([board[i], board[j], board[k]])) {
                        return true
                    }
                }
            }
        }
    }


    const sendSetAttempt = (indices) => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            // Get current player name from localStorage
            const playerName = localStorage.getItem('rs_name') || 'anonymous'

            // Find current player's ID from game state
            let playerId = null
            if (gameState() && gameState().game_state && gameState().game_state.players) {
                const player = gameState().game_state.players.find(p => p.name === playerName)
                if (player) {
                    playerId = player.id
                }
            }

            const message = {
                kind: 'set_attempt',
                data: indices,
                player_id: playerId
            }
            socket.send(JSON.stringify(message))

            // Clear selection after sending
            setSelectedCards([])
        } else {
            console.error('WebSocket is not connected')
        }
    }

    // Calculate grid columns for desktop (3 rows)
    const desktopCols = () => Math.ceil(cards().length / 3)

    return (
        <div class="h-full flex flex-col">
            {/* Game Board - Always visible with responsive grid */}
            {cards().length === 0 ? (
                <div class="text-center py-8 text-gray-500">
                    Loading game board...
                </div>
            ) : (
                <div class="flex-1 min-h-0 overflow-auto">
                    {/* Mobile: 3 columns, Desktop: dynamic columns to maintain 3 rows */}
                    <div
                        class="set-game-grid grid gap-1 sm:gap-2 p-2 mx-auto"
                        style={{
                            'grid-template-columns': 'repeat(3, 1fr)',
                            '--desktop-cols': desktopCols()
                        }}
                    >
                        <For each={cards()}>{(card, idx) => (

                            // aspect-[4 / 3] 
                            // md: aspect-[3 / 4]
                            <div class={`relative w-full
                                    
                                    card-container
                                    `}
                                style={{ '--desktop-cols': desktopCols() }}
                            >

                                <div
                                    class={` aspect-[3/4] card-container md:max-w-[180px] inset-0 border-2 rounded-[20px] max-w-[180px] mx-auto
                                            shadow-sm flex items-center justify-center cursor-pointer
                                            transition-all p-4
                                            ${selectedCards().includes(idx())
                                            ? 'bg-blue-200 border-blue-500'
                                            : 'bg-white hover:bg-gray-50 border-gray-200'}`}
                                    onClick={() => handleCardClick(idx())}
                                >
                                    {/* 
                                    rotate-90 md:rotate-0 
                                    transition-transform 
                                     */}
                                    <div class="w-full h-full 
                                    flex items-center justify-center">
                                        <img
                                            src={getCardImageUrl(card)}
                                            alt={`Card ${idx() + 1}`}
                                            class="
                                            sm:w-3/4
                                            w-full
                                            card-container
                                            object-contain p-1"
                                            onError={(e) => { e.target.style.display = 'none'; e.target.nextElementSibling.style.display = 'block' }}
                                            style={{ '--desktop-cols': desktopCols() }}

                                        />

                                        <div class="hidden text-xs text-gray-500">…</div>
                                    </div>
                                </div>
                            </div>

                        )}</For>
                    </div>
                </div >
            )
            }
        </div >
    )
}
