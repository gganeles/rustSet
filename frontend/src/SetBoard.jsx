import { For, createSignal } from 'solid-js'

export default function SetBoard(props) {
    const cards = [
        [1, 2, 3, 1],
        [2, 2, 2, 2],
        [3, 1, 2, 3],
        [1, 1, 1, 1],
        [2, 3, 1, 2],
        [3, 3, 3, 2],
        [1, 2, 1, 3],
        [2, 1, 3, 1],
        [3, 2, 2, 3],
        [1, 3, 2, 2],
        [2, 3, 3, 1],
        [3, 1, 1, 2],
    ]
    const socket = props.socket || null
    const [selectedCards, setSelectedCards] = createSignal([])

    socket.addEventListener('message', (e) => {
        const data = JSON.parse(e.data)
        console.log('Received data:', data)
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
        <div class="grid grid-cols-3 sm:grid-cols-4 gap-3">
            <For each={cards}>{(card, idx) => (
                <div
                    class={`p-3 border rounded shadow-sm flex flex-col items-center justify-center min-h-[92px] cursor-pointer transition-all ${selectedCards().includes(idx())
                            ? 'bg-blue-200 border-blue-500 border-2'
                            : 'bg-white hover:bg-gray-50'
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
    )
}
