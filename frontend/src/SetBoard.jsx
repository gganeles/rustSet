import { For, createSignal, onMount } from 'solid-js'

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

        // Notify parent component of game state update
        onGameStateUpdate(gameData)
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
        <div class="h-full flex flex-col p-4">
            {/* Game Board - Always visible with responsive grid */}
            {cards().length === 0 ? (
                <div class="text-center py-8 text-gray-500">
                    Loading game board...
                </div>
            ) : (
                <div class="flex-1 min-h-0 overflow-auto">
                    <div class="grid grid-cols-3 md:grid-cols-4 gap-1 sm:gap-2 p-2">
                        <For each={cards()}>{(card, idx) => (
                            <div
                                class={`border-2 h-[20vh] md:h-[25vh] rounded-[20px] shadow-sm flex items-center justify-center cursor-pointer transition-all w-full ${selectedCards().includes(idx())
                                    ? 'bg-blue-200 border-blue-500'
                                    : 'bg-white hover:bg-gray-50 border-gray-200'
                                    }`}
                                // style={{
                                //     height: '',
                                // }}
                                onClick={() => handleCardClick(idx())}
                            >
                                <img
                                    src={getCardImageUrl(card)}
                                    alt={`Card ${idx() + 1}`}
                                    class="w-[15vw] max-w-[110px] h-auto object-contain p-1"
                                    onError={(e) => {
                                        // Fallback if image fails to load
                                        e.target.style.display = 'none'
                                        e.target.nextElementSibling.style.display = 'block'
                                    }}
                                />
                                <div class="hidden text-xs text-gray-500">
                                    <div>Card {idx() + 1}</div>
                                    <ul class="space-y-0 text-sm text-gray-800">
                                        {card.map((n, i) => (
                                            <li key={i} class="text-center leading-tight">{n}</li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        )}</For>
                    </div>
                </div>
            )}
        </div>
    )
}
