import { onCleanup, createSignal, For, createEffect, onMount } from "solid-js";
import SetBoard from "./SetBoard";
import GameOverModal from "./GameOverModal";
import { navigate } from "./utils/test.js";

export default function SetGame(props) {
  const socket = props.socket || null;
  const id = props.id;

  const [messages, setMessages] = createSignal([]);
  const [isChatOpen, setIsChatOpen] = createSignal(false);
  const [gameState, setGameState] = createSignal(null);
  const [showGameOver, setShowGameOver] = createSignal(false);
  let messagesEndRef;

  // Auto-scroll to bottom when messages change
  createEffect(() => {
    const msgs = messages();
    if (messagesEndRef && msgs.length > 0) {
      setTimeout(() => {
        messagesEndRef.scrollIntoView({ behavior: "smooth", block: "end" });
      }, 0);
    }
  });

  // Helper function to get card image URL (same as in SetBoard)
  const getCardImageUrl = (cardArray) => {
    const shapes = ["oval", "squiggle", "diamond"];
    const fillings = ["filled", "lines", "clear"];
    const colors = ["red", "green", "purple"];
    const numbers = ["1", "2", "3"];

    const shape = shapes[cardArray[0]];
    const filling = fillings[cardArray[1]];
    const color = colors[cardArray[2]];
    const number = numbers[cardArray[3]];

    return `https://set.gganeles.com/RegCards/${shape}_${filling}_${color}_${number}.png`;
  };

  function handleMessage(e) {
    try {
      const data = JSON.parse(e.data);

      // Handle different message types
      if (data.kind === "init") {
        try {
          const gameData = JSON.parse(data.data);
          if (gameData.chat && Array.isArray(gameData.chat)) {
            const chatMessages = gameData.chat.map((msg) => ({
              sender: msg.sender,
              text: msg.text,
              isSystem: msg.sender === "System",
              cards: msg.cards || undefined,
            }));
            setMessages(chatMessages);
          }
          setGameState(gameData);
          // notify child board about initial state
          try {
            onGameStateUpdate(gameData);
          } catch (e) {}
        } catch (err) {
          console.error("Error parsing init in SetGame:", err);
        }
      } else if (data.kind === "player_joined") {
        try {
          const gameData = JSON.parse(data.data);
          handleGameStateUpdate(gameData);
        } catch (err) {
          console.error("Error parsing player_joined:", err);
        }
      } else if (data.kind === "chat") {
        try {
          const chatData = JSON.parse(data.data);
          if (chatData.sender && chatData.message) {
            setMessages((prev) => [
              ...prev,
              { sender: chatData.sender, text: chatData.message },
            ]);
          } else {
            setMessages((prev) => [
              ...prev,
              { sender: "Unknown", text: data.data },
            ]);
          }
        } catch {
          setMessages((prev) => [
            ...prev,
            { sender: "Player", text: data.data },
          ]);
        }
      } else if (data.kind === "set_found") {
        try {
          const gameData = JSON.parse(data.data);
          if (gameData.chat && Array.isArray(gameData.chat)) {
            const chatMessages = gameData.chat.map((msg) => ({
              sender: msg.sender,
              text: msg.text,
              isSystem: msg.sender === "System",
              cards: msg.cards || undefined,
            }));
            setMessages(chatMessages);
          }
          setGameState(gameData);
        } catch (err) {
          console.error("Error parsing set_found:", err);
        }
      }
    } catch (err) {
      console.error("Error parsing message in SetGame:", err);
    }
  }

  onMount(() => {
    if (socket) {
      socket.addEventListener("message", handleMessage);
    }
  });

  // React to initialData when it appears (covers before/after mount)
  createEffect(() => {
    const init =
      typeof props.initialData === "function"
        ? props.initialData()
        : props.initialData;
    if (!init) return;
    try {
      const gameData = init;
      if (gameData.chat && Array.isArray(gameData.chat)) {
        const chatMessages = gameData.chat.map((msg) => ({
          sender: msg.sender,
          text: msg.text,
          isSystem: msg.sender === "System",
          cards: msg.cards || undefined,
        }));
        setMessages(chatMessages);
      }
      setGameState(gameData);
      // notify child board about initial state
      try {
        onGameStateUpdate(gameData);
      } catch (e) {}
    } catch (err) {
      console.error("Error initializing SetGame from initialData:", err);
    }
  });

  onCleanup(() => {
    if (socket) {
      try {
        socket.removeEventListener("message", handleMessage);
      } catch (e) {}
    }
  });

  const [input, setInput] = createSignal("");

  function handleGameStateUpdate(newGameState) {
    setGameState(newGameState);

    if (
      newGameState &&
      newGameState.game_state &&
      newGameState.game_state.current_state === "game_over"
    ) {
      setShowGameOver(true);
    }
  }

  function sendChat(e) {
    e.preventDefault();
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const text = input().trim();
    if (text === "") return;
    const senderName = localStorage.getItem("rs_name") || "Anonymous";
    const chatData = JSON.stringify({ sender: senderName, message: text });
    const msg = { kind: "chat", data: chatData };
    socket.send(JSON.stringify(msg));
    setInput("");
  }

  function closeChat(e) {
    e?.preventDefault();
    e?.stopPropagation();
    setIsChatOpen(false);
  }

  return (
    <div class="h-screen flex flex-col">
      <div class="flex items-center justify-between px-4 py-2 bg-white border-b shadow-sm flex-shrink-0 flex-wrap gap-4">
        {gameState() &&
          gameState().game_state &&
          gameState().game_state.players && (
            <>
              <h2 class="text-lg font-semibold whitespace-nowrap">
                {gameState().game_state.name}
              </h2>
              <div class="flex flex-wrap gap-2 flex-1 justify-center">
                <For each={gameState().game_state.players}>
                  {(player) => (
                    <div class="flex items-center gap-2 px-2 py-1 bg-gray-50 rounded text-sm">
                      <span class="font-medium text-gray-800">
                        {player.name}
                      </span>
                      <span class="font-bold text-blue-600">
                        {player.score}
                      </span>
                    </div>
                  )}
                </For>
              </div>
            </>
          )}

        <div class="flex flex-row items-center gap-2 whitespace-nowrap">
          <button
            class="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
            onClick={() => navigate("/")}
          >
            Back to Lobby
          </button>

          <button
            onClick={() => setIsChatOpen(!isChatOpen())}
            class="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-2"
          >
            <span>{isChatOpen() ? "Hide Chat" : "Show Chat"}</span>
            <span>{isChatOpen() ? "→" : "←"}</span>
          </button>
        </div>
      </div>

      <div class="relative flex-1 overflow-hidden">
        <div class="h-full overflow-auto">
          <SetBoard
            socket={socket}
            onGameStateUpdate={handleGameStateUpdate}
            initialData={props.initialData}
          />
        </div>
      </div>

      <div
        class={`fixed top-0 right-0 h-full w-80 bg-white shadow-2xl border-l transform transition-transform duration-300 flex flex-col z-50 ${
          isChatOpen() ? "translate-x-0" : "translate-x-full"
        }`}
      >
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

        <div class="flex-1 overflow-auto p-4">
          <ul class="space-y-2">
            {messages().map((m, i) => (
              <li
                key={i}
                class={`text-sm p-2 rounded ${m.isSystem ? "bg-green-50 border border-green-200" : "bg-gray-50 text-gray-800"}`}
              >
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
            <div ref={messagesEndRef}></div>
          </ul>
        </div>

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

      {showGameOver() &&
        gameState() &&
        gameState().game_state &&
        gameState().game_state.players && (
          <GameOverModal
            players={gameState().game_state.players}
            onClose={() => setShowGameOver(false)}
          />
        )}
    </div>
  );
}
