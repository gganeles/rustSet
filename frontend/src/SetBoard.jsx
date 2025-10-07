import { For, createSignal, onMount } from 'solid-js'

export default function SetBoard(props) {
    const socket = props.socket || null
    const [selectedCards, setSelectedCards] = createSignal([])
    const [cards, setCards] = createSignal([])
    const [gameState, setGameState] = createSignal(null)

    // Function to render the new board from game data
    const renderBoard = (gameData) => {
        if (!gameData.board) {
            console.error('No board data found in game data')
            return
        }

        // Extract card arrays from the board
        const boardCards = gameData.board.map(card => card.array)

        console.log('Rendering board with cards:', boardCards)

        // Update the cards state to trigger re-render
        setCards(boardCards)

        // Check if there are any sets on the board
        checkBoardForSets(boardCards)

        // Update game state
        setGameState(gameData)
    }

    // Handle incoming messages from the server
    const handleMessage = (e) => {
        try {
            const message = JSON.parse(e.data)
            console.log('Received message:', message)

            if (message.kind === 'init') {
                // Parse and render initial game state
                const gameData = JSON.parse(message.data)
                console.log('Initial game data:', gameData)
                renderBoard(gameData)
            } else if (message.kind === 'set_found') {
                // Parse and render updated board after set was found
                const gameData = JSON.parse(message.data)
                console.log('Set found! Updated game data:', gameData)
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
                        console.log('Found a set on the board:', i, j, k)
                        return true
                    }
                }
            }
        }
    }


    const sendSetAttempt = (indices) => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            const message = {
                kind: 'set_attempt',
                data: indices
            }
            socket.send(JSON.stringify(message))
            console.log('Sent set_attempt:', indices)

            // Clear selection after sending
            setSelectedCards([])
        } else {
            console.error('WebSocket is not connected')
        }
    }

    return (
        <div>
            {/* Scoreboard */}
            {gameState() && gameState().game_state && gameState().game_state.players && (
                <div class="mb-4 bg-white rounded-lg shadow-md p-4">
                    <h3 class="text-lg font-semibold mb-3 text-gray-700">Scoreboard</h3>
                    <div class="space-y-2">
                        <For each={gameState().game_state.players}>
                            {(player) => (
                                <div class="flex items-center justify-between p-2 bg-gray-50 rounded hover:bg-gray-100 transition-colors">
                                    <span class="font-medium text-gray-800">{player.name}</span>
                                    <span class="text-lg font-bold text-blue-600">{player.score}</span>
                                </div>
                            )}
                        </For>
                    </div>
                </div>
            )}

            {/* Game Board */}
            {cards().length === 0 ? (
                <div class="text-center py-8 text-gray-500">
                    Loading game board...
                </div>
            ) : (
                <div class="grid grid-cols-3 sm:grid-cols-4 gap-3">
                    <For each={cards()}>{(card, idx) => (
                        <div
                            class={`p-3 border-2 rounded shadow-sm flex flex-col items-center justify-center min-h-[92px] cursor-pointer transition-all ${selectedCards().includes(idx())
                                ? 'bg-blue-200 border-blue-500'
                                : 'bg-white hover:bg-gray-50 border-gray-200'
                                }`}
                            onClick={() => handleCardClick(idx())}
                        >
                            <div class="text-sm text-gray-600 mb-1">Card {idx() + 1}</div>
                            <ul class="space-y-0.5 text-sm text-gray-800">
                                {card.map((n, i) => (
                                    <li key={i} class="text-center">{n}</li>
                                ))}
                            </ul>
                        </div>
                    )}</For>
                </div>
            )}
        </div>
    )
}
