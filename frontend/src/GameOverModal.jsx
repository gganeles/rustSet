import { For } from 'solid-js'
import { navigate } from './utils/test.js'

export default function GameOverModal(props) {
  const players = props.players || []
  const onClose = props.onClose || (() => {})

  // Sort players by score (descending)
  const sortedPlayers = () => {
    return [...players].sort((a, b) => b.score - a.score)
  }

  const winner = () => sortedPlayers()[0]

  const handleBackToLobby = () => {
    navigate('/')
    onClose()
  }

  return (
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-lg shadow-2xl max-w-md w-full p-6">
        {/* Header */}
        <div class="text-center mb-6">
          <h2 class="text-3xl font-bold text-gray-900 mb-2">Game Over!</h2>
          {winner() && (
            <p class="text-xl text-green-600 font-semibold">
              🎉 {winner().name} wins! 🎉
            </p>
          )}
        </div>

        {/* Scores List */}
        <div class="mb-6">
          <h3 class="text-lg font-semibold text-gray-700 mb-3">Final Scores</h3>
          <ul class="space-y-2">
            <For each={sortedPlayers()}>
              {(player, index) => (
                <li
                  class={`flex items-center justify-between p-3 rounded-lg ${
                    index() === 0
                      ? 'bg-yellow-100 border-2 border-yellow-400'
                      : 'bg-gray-50 border border-gray-200'
                  }`}
                >
                  <div class="flex items-center gap-3">
                    <span class="text-2xl font-bold text-gray-500">
                      {index() === 0 ? '🥇' : index() === 1 ? '🥈' : index() === 2 ? '🥉' : `${index() + 1}.`}
                    </span>
                    <span class={`font-medium ${index() === 0 ? 'text-yellow-900' : 'text-gray-800'}`}>
                      {player.name}
                    </span>
                  </div>
                  <span class={`text-2xl font-bold ${index() === 0 ? 'text-yellow-600' : 'text-blue-600'}`}>
                    {player.score}
                  </span>
                </li>
              )}
            </For>
          </ul>
        </div>

        {/* Actions */}
        <div class="flex gap-3">
          <button
            onClick={handleBackToLobby}
            class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            Back to Lobby
          </button>
          <button
            onClick={onClose}
            class="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-medium"
          >
            Stay Here
          </button>
        </div>
      </div>
    </div>
  )
}
