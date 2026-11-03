# rustSet - Multiplayer Card Games

A real-time multiplayer gaming platform featuring the card game **Set** and **Anagrams**, built with a Rust WebSocket server and SolidJS frontend.

## 🎮 Games

### Set
The classic pattern-recognition card game where players race to identify sets of three cards that are all the same or all different across four attributes: color, shape, number, and shading.

### Anagrams
A word game where players compete to form words from a shared pool of letters, with the ability to steal words by adding letters to form new valid words.

## 🏗️ Architecture

### Backend (Rust)
- **WebSocket Server**: Real-time communication using `tokio`, `warp`, and `tokio-tungstenite`
- **Game Engine**: Trait-based game system supporting multiple game types
- **Python Integration**: Uses PyO3 to integrate with spaCy for NLP features in Anagrams
- **Features**:
  - Room-based multiplayer games
  - Real-time game state synchronization
  - Chat system with game notifications
  - Player management and scoring

### Frontend (SolidJS)
- **Framework**: SolidJS with Vite for fast, reactive UI
- **Styling**: TailwindCSS for responsive design
- **Features**:
  - Real-time game updates via WebSockets
  - Lobby system for creating and joining games
  - Interactive game boards
  - Player name customization
  - Image preloading for smooth gameplay

## 📁 Project Structure

```
rustSet/
├── server/          # Rust WebSocket server
│   ├── src/
│   │   ├── main.rs           # Server entry point
│   │   ├── router.rs         # WebSocket routing
│   │   ├── user.rs           # User management
│   │   └── game/             # Game implementations
│   │       ├── mod.rs        # Game trait & system
│   │       ├── set.rs        # Set game logic
│   │       ├── anagrams.rs   # Anagrams game logic
│   │       └── player.rs     # Player state
│   └── Cargo.toml
└── frontend/        # SolidJS application
    ├── src/
    │   ├── App.jsx           # Main app & routing
    │   ├── Lobby.jsx         # Game lobby
    │   ├── Game.jsx          # Game wrapper
    │   ├── SetGame.jsx       # Set game UI
    │   ├── Anagrams.jsx      # Anagrams game UI
    │   └── utils/            # Utilities
    └── package.json
```

## 🚀 Quick Start

### Prerequisites
- **Rust** (latest stable version)
- **Node.js** (v16 or higher)
- **Python 3** (for Anagrams NLP features)

### Running the Server

#### Option 1: Local Development (Recommended)

```bash
cd server

# For fish shell users:
./setup_python.fish

# For bash/zsh users:
./setup_python.sh

# Activate the virtual environment
source venv/bin/activate.fish  # fish
# or
source venv/bin/activate        # bash/zsh

# Run the server
cargo run
```

The server will start on `ws://127.0.0.1:3030/ws`

#### Option 2: Linux Server (no Docker)

```bash
sudo sh linux/install.sh
```

Builds the server, sets up Python and spaCy, and runs it as the `rustset` systemd service on
`127.0.0.1:3030`. See [server/README.md](server/README.md#linux-server-without-docker).

#### Option 3: Docker

```bash
# From repository root
docker-compose up --build
```

See [server/README.md](server/README.md) for detailed setup instructions.

### Running the Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

## 🎯 How to Play

1. **Start the server** (see above)
2. **Start the frontend** (see above)
3. **Open your browser** to http://localhost:5173
4. **Enter your name** when prompted
5. **Create a new game** or **join an existing game** from the lobby
6. **Play!** Click cards to select them and compete with other players in real-time

## 🛠️ Development

### Technologies

**Backend:**
- Rust 2021 edition
- Tokio (async runtime)
- Warp (web framework)
- tokio-tungstenite (WebSocket)
- PyO3 (Python integration)
- serde (serialization)

**Frontend:**
- SolidJS 1.7
- Vite 5.0
- TailwindCSS 4.0
- Native WebSocket API

### Running Tests

```bash
cd server
cargo test
```

## 📝 License

This project is provided as-is for educational and entertainment purposes.

## 🤝 Contributing

Feel free to open issues or submit pull requests for improvements!
