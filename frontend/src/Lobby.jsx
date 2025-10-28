import { createSignal, onCleanup, onMount } from 'solid-js'
import NameModal from './NameModal'
import { navigate } from './utils/test.js'
import { hostname } from './const.js'

export default function Lobby(props) {
  const [games, setGames] = createSignal([])
  const [name, setName] = createSignal('')
  const [creator, setCreator] = createSignal('')
  const [gameType, setGameType] = createSignal('set')
  const [showNameModal, setShowNameModal] = createSignal(true)
  const [nameError, setNameError] = createSignal('')
  const [gameError, setGameError] = createSignal('')
  const [infoMessage, setInfoMessage] = createSignal('')
  let socket = null

  function handleMessage(e) {
    try {
      const data = JSON.parse(e.data)
      if (data.kind === 'games_list') {
        try { setGames(JSON.parse(data.data)) } catch (err) { }
      } else if (data.kind === 'game_created') {
        // Auto-join the game that was just created
        console.info('Received game_created message:', data)
        try {
          const payload = JSON.parse(data.data)
          if (payload.id && payload.creator === creator()) {
            joinGame(payload.id)
          }
        } catch (err) {
          console.error('Failed to parse game_created:', err)
        }
      }
    } catch (err) {
      // ignore
    }
  }

  function connect() {
    if (socket) { try { socket.close() } catch (e) { } }
    // Use current host and determine ws/wss based on protocol
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    // Get hostname without port, then add backend port
    const wsUrl = `${protocol}//${hostname}/lobby`
    socket = new WebSocket(wsUrl)
    socket.addEventListener('message', handleMessage)
    socket.addEventListener('open', () => {
      const msg = { kind: 'list_games', data: '' }
      socket.send(JSON.stringify(msg))
    })
    socket.addEventListener('error', (err) => {
      console.error('WebSocket error:', err)
    })
    socket.addEventListener('close', () => { })
  }

  // Attempt to read saved name and prefill creator. If not present, show modal.
  onMount(() => {
    try {
      const saved = localStorage.getItem('rs_name')
      if (saved && saved.length > 0) {
        setCreator(saved)
        setShowNameModal(false)
      } else {
        setShowNameModal(true)
      }
    } catch (e) {
      setShowNameModal(true)
    }

    // connect after mount
    connect()
  })

  onCleanup(() => { if (socket) try { socket.close() } catch (e) { } })

  function createGame(e) {
    e && e.preventDefault()
    if (!creator() || creator().trim() === '') {
      setNameError('Please set your name first')
      return
    }
    if (!name() || name().trim() === '') {
      setGameError('Please enter a game name')
      return
    }
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    const payload = { name: name(), creator: creator(), game_type: gameType() }
    socket.send(JSON.stringify({ kind: 'create_game', data: JSON.stringify(payload) }))
    setName('')
    setGameError('')
  }

  function handleSaveName(val) {
    const v = (val || '').trim()
    if (!v) return
    try { localStorage.setItem('rs_name', v) } catch (e) { }
    setCreator(v)
    setShowNameModal(false)
    setNameError('')
    setInfoMessage('Name saved')
    setTimeout(() => setInfoMessage(''), 3000)
  }

  function joinGame(id) {
    // notify server and navigate
    if (socket && socket.readyState === WebSocket.OPEN) {
      const payload = { id, player: creator() || 'anonymous' }
      socket.send(JSON.stringify({ kind: 'join_game', data: JSON.stringify(payload) }))
    }

    navigate(`/game/${id}`)
    props.onJoin(id)
  }

  function deleteGame(id) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    const payload = { id }
    socket.send(JSON.stringify({ kind: 'delete_game', data: JSON.stringify(payload) }))
  }

  function changeName(e) {
    e && e.preventDefault()
    const v = creator().trim()
    if (!v) {
      setNameError('Please enter a name')
      return
    }
    handleSaveName(creator())
  }

  return (
    <div class='min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50'>
      {showNameModal() && (
        <NameModal prefill={creator()} onSave={handleSaveName} />
      )}

      <div class='max-w-5xl mx-auto p-3 sm:p-6'>
        {/* Header */}
        <div class='text-center mb-4 sm:mb-8'>
          <h1 class='text-3xl sm:text-4xl font-bold text-indigo-900 mb-1 sm:mb-2'>Game Lobby</h1>
          <p class='text-sm sm:text-base text-gray-600'>Create or join a game to get started</p>
        </div>

        {/* User Profile Card */}
        <div class='bg-white rounded-xl sm:rounded-2xl shadow-lg p-4 sm:p-6 mb-3 sm:mb-6 border border-indigo-100'>
          <h2 class='text-lg sm:text-xl font-semibold text-gray-800 mb-3 sm:mb-4 flex items-center gap-2'>
            <svg class="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Your Profile
          </h2>
          <form onSubmit={changeName} class="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
            <div class="flex-1 w-full sm:w-auto">
              <input
                class="w-full px-3 py-2 sm:px-4 sm:py-3 border-2 border-gray-200 rounded-lg sm:rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all text-sm sm:text-base"
                placeholder="Enter your name"
                value={creator()}
                onInput={(e) => setCreator(e.target.value)}
              />
            </div>
            <button
              type="submit"
              class="w-full sm:w-auto px-4 py-2 sm:px-6 sm:py-3 bg-indigo-600 text-white font-medium rounded-lg sm:rounded-xl hover:bg-indigo-700 active:bg-indigo-800 shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5 text-sm sm:text-base"
            >
              Set Name
            </button>
          </form>
          {nameError() && (
            <div class="mt-2 sm:mt-3 text-xs sm:text-sm text-red-600 bg-red-50 px-3 py-2 sm:px-4 rounded-lg flex items-center gap-2">
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
              </svg>
              {nameError()}
            </div>
          )}
          {infoMessage() && (
            <div class="mt-2 sm:mt-3 text-xs sm:text-sm text-green-700 bg-green-50 px-3 py-2 sm:px-4 rounded-lg flex items-center gap-2">
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
              </svg>
              {infoMessage()}
            </div>
          )}
        </div>

        {/* Create Game Card */}
        <div class='bg-white rounded-xl sm:rounded-2xl shadow-lg p-4 sm:p-6 mb-3 sm:mb-6 border border-purple-100'>
          <h2 class='text-lg sm:text-xl font-semibold text-gray-800 mb-3 sm:mb-4 flex items-center gap-2'>
            <svg class="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Create New Game
          </h2>
          <form onSubmit={createGame} class="flex flex-col gap-3 sm:gap-4">
            <div class="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <div class="flex-1">
                <input
                  class="w-full px-3 py-2 sm:px-4 sm:py-3 border-2 border-gray-200 rounded-lg sm:rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all text-sm sm:text-base"
                  placeholder="Game name"
                  value={name()}
                  onInput={(e) => setName(e.target.value)}
                />
              </div>
              <div class="w-full sm:w-48">
                <select
                  class="w-full px-3 py-2 sm:px-4 sm:py-3 border-2 border-gray-200 rounded-lg sm:rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all bg-white cursor-pointer text-sm sm:text-base"
                  value={gameType()}
                  onInput={(e) => setGameType(e.target.value)}
                >
                  <option value="set">Set</option>
                  <option value="anagrams">Anagram</option>
                </select>
              </div>
              <button
                type="submit"
                class="w-full sm:w-auto px-4 py-2 sm:px-6 sm:py-3 bg-purple-600 text-white font-medium rounded-lg sm:rounded-xl hover:bg-purple-700 active:bg-purple-800 shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5 text-sm sm:text-base"
              >
                Create Game
              </button>
            </div>
            {gameError() && (
              <div class="text-xs sm:text-sm text-red-600 bg-red-50 px-3 py-2 sm:px-4 rounded-lg flex items-center gap-2">
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                </svg>
                {gameError()}
              </div>
            )}
          </form>
        </div>

        {/* Available Games Card */}
        <div class='bg-white rounded-xl sm:rounded-2xl shadow-lg p-4 sm:p-6 border border-pink-100'>
          <h2 class='text-lg sm:text-xl font-semibold text-gray-800 mb-3 sm:mb-4 flex items-center gap-2'>
            <svg class="w-5 h-5 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Available Games
            <span class="ml-auto text-xs sm:text-sm font-normal text-gray-500 bg-gray-100 px-2 py-0.5 sm:px-3 sm:py-1 rounded-full">
              {games().length} {games().length === 1 ? 'game' : 'games'}
            </span>
          </h2>
          <div class="space-y-2 sm:space-y-3">
            {games().length === 0 ? (
              <div class="text-center py-8 sm:py-12">
                <svg class="w-12 h-12 sm:w-16 sm:h-16 mx-auto text-gray-300 mb-3 sm:mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
                <p class="text-gray-500 font-medium text-sm sm:text-base">No games available</p>
                <p class="text-gray-400 text-xs sm:text-sm mt-1">Create one to get started!</p>
              </div>
            ) : (
              games().map((g, i) => (
                <div key={i} class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3 p-3 sm:p-4 border-2 border-gray-100 rounded-lg sm:rounded-xl hover:border-pink-200 hover:bg-pink-50/50 transition-all">
                  <div class="flex-1">
                    <div class="font-semibold text-gray-800 text-base sm:text-lg">{g.name}</div>
                    <div class="text-xs sm:text-sm text-gray-600 mt-0.5 sm:mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span class="flex items-center gap-1">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        {g.creator}
                      </span>
                      <span class="flex items-center gap-1">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        {g.players_online} {g.players_online === 1 ? 'player' : 'players'}
                      </span>
                    </div>
                  </div>
                  <div class="flex gap-2 w-full sm:w-auto">
                    <button
                      class="flex-1 sm:flex-none px-4 py-2 sm:px-5 sm:py-2.5 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 active:bg-green-800 shadow-sm hover:shadow-md transition-all transform hover:-translate-y-0.5 text-sm sm:text-base"
                      onClick={() => joinGame(g.id)}
                    >
                      Join
                    </button>
                    <button
                      class="flex-1 sm:flex-none px-4 py-2 sm:px-5 sm:py-2.5 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 active:bg-red-800 shadow-sm hover:shadow-md transition-all transform hover:-translate-y-0.5 text-sm sm:text-base"
                      onClick={() => deleteGame(g.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
