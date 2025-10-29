import { For } from 'solid-js'
import { navigate } from './utils/test.js'

// Modal that shows every player's board and computes scores for Anagrams.
// Scoring rule: the first 3 letters of each word are worth 1 point total;
// each additional letter (beyond 3) is worth +1 point.
export default function AnagramsGameOverModal(props) {
    // Support new prop `players_boards` (raw boards from gameState) and
    // fall back to older `players` shape for compatibility.
    const boards = props.players_boards || (props.players || [])
    const onClose = props.onClose || (() => { })

    const scoreForWord = (word) => {
        if (!word || typeof word !== 'string' || word.length === 0) return 0
        return 1 + Math.max(0, word.length - 3)
    }

    const playerSummary = (player) => {
        // player.words expected to be an array of strings
        const words = (player && player.words) ? player.words : []
        const wordCount = words.length
        const extraLetters = words.reduce((acc, w) => acc + Math.max(0, (w ? w.length : 0) - 3), 0)
        const total = words.reduce((acc, w) => acc + scoreForWord(w), 0)
        return { words, wordCount, extraLetters, total }
    }

    const handleBackToLobby = () => {
        navigate('/')
        onClose()
    }

    return (
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div class="bg-white rounded-lg shadow-2xl max-w-4xl w-full p-6 max-h-[90vh] overflow-auto">
                <div class="flex items-start justify-between mb-4">
                    <div>
                        <h2 class="text-2xl font-bold text-gray-900">Game Over</h2>
                        <p class="text-sm text-gray-600">Final boards and scores</p>
                    </div>
                    <div class="flex gap-2">
                        <button
                            onClick={handleBackToLobby}
                            class="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                        >
                            Back to Lobby
                        </button>
                        <button
                            onClick={onClose}
                            class="px-3 py-1 bg-gray-100 text-gray-800 rounded-md hover:bg-gray-200 text-sm"
                        >
                            Close
                        </button>
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <For each={boards}>
                        {(pb) => {
                            // boards entries may be either in the form { player: { name }, words: [] }
                            // or in the older compatibility form { name, words }
                            const playerObj = (pb && pb.player) ? { name: pb.player.name } : { name: pb.name }
                            const playerShape = { name: playerObj.name || 'Player', words: pb.words || [] }
                            const summary = playerSummary(playerShape)
                            return (
                                <div class="bg-gray-50 rounded-lg border border-gray-200 p-3">
                                    <div class="flex items-center justify-between mb-2">
                                        <div class="font-semibold text-gray-800">{playerShape.name}</div>
                                        <div class="text-sm text-gray-600">{summary.wordCount} {summary.wordCount === 1 ? 'word' : 'words'}</div>
                                    </div>

                                    <div class="space-y-2 mb-3">
                                        {summary.words.length === 0 ? (
                                            <div class="text-gray-500 text-sm">(no words)</div>
                                        ) : (
                                            summary.words.map((word, wi) => (
                                                <div class="flex items-center justify-between" key={wi}>
                                                    <div class="flex gap-0.5 items-center">
                                                        {word.split('').map((ch, ci) => (
                                                            <div key={ci} class={`w-5 h-5 md:w-10 md:h-10 bg-orange-100 rounded-sm border-2 border-orange-200 shadow-md flex items-center justify-center text-md md:text-2xl font-bold ${ci === 3 ? 'ml-3 md:ml-4' : ''}`}>
                                                                {ch}
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <div class="text-sm text-gray-700 ml-3">{scoreForWord(word)} pts</div>
                                                </div>
                                            ))
                                        )}
                                    </div>

                                    <div class="border-t border-gray-200 pt-2 flex items-center justify-between">
                                        <div class="text-sm text-gray-600">{summary.wordCount} {summary.wordCount === 1 ? 'word' : 'words'}, {summary.extraLetters} extra {summary.extraLetters === 1 ? 'letter' : 'letters'}</div>
                                        <div class="text-lg font-bold text-gray-900">Total: {summary.total}</div>
                                    </div>
                                </div>
                            )
                        }}
                    </For>
                </div>
            </div>
        </div>
    )
}
