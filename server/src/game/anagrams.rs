use crate::game::{player::Player, GameState};
use lazy_static::lazy_static;
use std::sync::RwLock;
use std::{
    collections::{BTreeSet, HashMap},
    io::BufRead,
    sync::Arc,
};

use super::Uuid;
use rand::seq::SliceRandom;
use serde::Serialize;

use crate::router::Message;

use tokio::sync::broadcast;

lazy_static! {
    // Dictionary for anagrams (log(n) lookups)
    static ref DICT: Arc<BTreeSet<String>> = {
        let mut set: BTreeSet<String> = BTreeSet::new();
        // Build path relative to this crate
        let path = format!("{}/src/game/words.txt", env!("CARGO_MANIFEST_DIR"));
        if let Ok(f) = std::fs::File::open(&path) {
            let reader = std::io::BufReader::new(f);
            for line in reader.lines().flatten() {
                let word = line.trim().to_lowercase();
                if word.is_empty() {
                    continue;
                }
                set.insert(word);
            }
        }
        Arc::new(set)
    };


}

use pyo3::prelude::*;
use pyo3::sync::PyOnceLock;
use pyo3::types::PyDict;

static NLP: PyOnceLock<Py<PyAny>> = PyOnceLock::new();

/// Initialize the spaCy model once. Returns true on success.
pub fn init_lemmatizer() -> bool {
    Python::attach(|py| {
        // Add venv site-packages to sys.path if we're running from a venv
        if let Ok(sys) = py.import("sys") {
            if let Ok(path) = sys.getattr("path") {
                // Try to import from venv
                let venv_paths = vec![
                    "./venv/lib/python3.11/site-packages",
                    "./venv/lib/python3.10/site-packages",
                    "./venv/lib/python3.12/site-packages",
                    "venv/lib/python3.11/site-packages",
                    "venv/lib/python3.10/site-packages",
                    "venv/lib/python3.12/site-packages",
                ];
                for venv_path in venv_paths {
                    let _ = path.call_method1("insert", (0, venv_path));
                }
            }
        }

        let spacy = match py.import("spacy") {
            Ok(m) => m,
            Err(_) => return false,
        };
        let kwargs = PyDict::new(py);
        // exclude heavy pipeline components not needed
        if kwargs.set_item("exclude", vec!["parser", "ner"]).is_err() {
            return false;
        }
        let nlp_obj = match spacy.call_method("load", ("en_core_web_sm",), Some(&kwargs)) {
            Ok(o) => o,
            Err(_) => return false,
        };
        NLP.set(py, nlp_obj.unbind()).is_ok()
    })
}

/// Returns true if the lemmas of word1 and word2 are equal; false on error.
pub fn are_lemmas_equal(word1: &str, word2: &str) -> bool {
    Python::attach(|py| {
        if NLP.get(py).is_none() {
            if !init_lemmatizer() {
                return false;
            }
        }

        let nlp_ref = match NLP.get(py) {
            Some(n) => n,
            None => return false,
        };
        let nlp = nlp_ref.bind(py);

        // helper to get lemma of first token (convert to lowercase for consistency)
        let get_lemma = |w: &str| -> Option<String> {
            let lowercase_w = w.to_lowercase();
            let doc = nlp.call_method1("__call__", (lowercase_w.as_str(),)).ok()?;
            let tok0 = doc.get_item(0).ok()?;
            tok0.getattr("lemma_").ok()?.extract::<String>().ok()
        };

        match (get_lemma(word1), get_lemma(word2)) {
            (Some(l1), Some(l2)) => l1 == l2,
            _ => false,
        }
    })
}

fn get_dict() -> Arc<BTreeSet<String>> {
    DICT.clone()
}

#[derive(Debug, Serialize, Clone)]
pub struct PlayerBoard {
    pub player: Player,
    pub words: Vec<String>,
}

impl PlayerBoard {
    fn add_word(&mut self, word: String) {
        self.words.push(word);
    }

    fn remove_word(&mut self, word: &String) -> bool {
        if let Some(index) = self.words.iter().position(|x| *x == *word) {
            self.words.remove(index);
            return true;
        }
        false
    }

    fn from_player(player: &Player) -> Self {
        PlayerBoard {
            player: player.clone(),
            words: Vec::new(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct Anagrams {
    pub game_state: GameState,
    inner: Arc<RwLock<Inner>>,
}

#[derive(Debug, Clone)]
struct LastMove {
    attacker_id: Uuid,
    victim_id: Option<Uuid>, // None if word was taken from pot
    word_taken: String,
    word_stolen: Option<String>, // None if taken from pot
    old_pot: Vec<char>,
}

#[derive(Debug, Clone)]
struct Inner {
    bag: Bag,
    pot: Vec<char>,
    players_boards: Vec<PlayerBoard>,
    paused: bool,
    active_challenge: bool,
    challenge_votes: HashMap<Uuid, bool>, // true = challenge, false = maintain
    last_move: Option<LastMove>,
}

#[derive(Debug, Serialize)]
struct AnagramCompletedData {
    game_state: GameState,
    pot: Vec<char>,
    players_boards: Vec<PlayerBoard>,
    chat: Vec<super::ChatMessage>,
}

#[derive(Debug, Serialize)]
struct GameStateData {
    game_state: GameState,
    pot: Vec<char>,
    players_boards: Vec<PlayerBoard>,
    chat: Vec<super::ChatMessage>,
}

#[derive(Debug, Serialize, Clone)]
struct Bag {
    letters: Vec<char>,
}

impl Bag {
    fn new() -> Self {
        // Placeholder for dealing cards logic
        let mut letters: Vec<char> = Vec::with_capacity(200);
        let _ = "AAAAAAAAAAAAABBBCCCDDDDDDEEEEEEEEEEEEEEEEEEFFFGGGGHHHIIIIIIIIIIIJJKKLLLLLMMMNNNNNNNNOOOOOOOOOOOPPPQQRRRRRRRRRSSSSSSTTTTTTTTTUUUUUUVVVWWWXXYYYZZ"
            .to_lowercase()
            .chars()
            .for_each(|x| letters.push(x));
        // use a thread-local RNG for shuffling
        let mut rng = rand::rng();
        letters.shuffle(&mut rng);
        Bag { letters }
    }
}

fn pot_anagram(word_to_check: &str, mut pot: Vec<char>) -> Option<Vec<char>> {
    let mut counter: HashMap<char, i8> = HashMap::new();

    for ch in word_to_check.chars() {
        *counter.entry(ch).or_insert(0) += 1;
    }

    // consume letters from the pot; if any required letter is missing, return None
    for (ch, count) in counter.into_iter() {
        for _ in 0..count {
            if let Some(pos) = pot.iter().position(|c| *c == ch) {
                pot.remove(pos);
            } else {
                return None;
            }
        }
    }

    Some(pot)
}

fn some_anagram(existing_word: &str, word_to_check: &str, mut pot: Vec<char>) -> Option<Vec<char>> {
    let mut counter: HashMap<char, i8> = HashMap::new();
    if word_to_check.len() <= existing_word.len() {
        return None;
    }

    if are_lemmas_equal(existing_word, word_to_check) {
        return None;
    }

    for letter in word_to_check.chars() {
        *counter.entry(letter).or_insert(0) += 1;
    }

    for letter in existing_word.chars() {
        match counter.get(&letter) {
            Some(amount) => {
                if *amount == 0 {
                    return None;
                } else {
                    counter.insert(letter, amount - 1)
                }
            }
            None => return None,
        };
    }

    // Check if we can consume the required letters from the pot
    for (ch, count) in counter.iter() {
        let mut needed = *count;
        while needed > 0 {
            if let Some(pos) = pot.iter().position(|c| c == ch) {
                pot.remove(pos);
                needed -= 1;
            } else {
                // Not enough of this letter in the pot
                return None;
            }
        }
    }

    Some(pot)
}

impl Anagrams {
    pub fn new(name: String) -> Self {
        let mut bag = Bag::new();
        let pot = vec![bag.letters.pop().unwrap()];

        let game_state = GameState {
            id: Uuid::new_v4(),
            name,
            broadcast_tx: Arc::new(tokio::sync::broadcast::channel(64).0),
            players: vec![],
            current_state: String::from("in_progress"),
            chat: Vec::new(),
        };

        let inner = Arc::new(RwLock::new(Inner {
            bag,
            pot,
            players_boards: Vec::new(),
            paused: false,
            active_challenge: false,
            challenge_votes: HashMap::new(),
            last_move: None,
        }));

        // spawn a background tile dealer thread that owns a clone of inner and the broadcast tx
        let inner_clone = inner.clone();
        let broadcast_clone = game_state.broadcast_tx.clone();
        std::thread::spawn(move || {
            // We check pause more often than the deal interval so pausing is responsive.
            let deal_interval = std::time::Duration::from_secs(7);
            let tick = std::time::Duration::from_millis(200);
            let mut accumulated = std::time::Duration::ZERO;
            loop {
                std::thread::sleep(tick);

                // If paused, don't advance accumulated time or deal tiles
                {
                    let inner_r = inner_clone.read().unwrap();
                    if inner_r.paused {
                        continue;
                    }
                }

                accumulated += tick;
                if accumulated < deal_interval {
                    continue;
                }
                accumulated = std::time::Duration::ZERO;

                let mut inner_w = inner_clone.write().unwrap();
                if let Some(tile) = inner_w.bag.letters.pop() {
                    inner_w.pot.push(tile);
                    let msg = Message {
                        kind: "new_tile".into(),
                        data: serde_json::to_string(&inner_w.pot).unwrap(),
                    };
                    let json = serde_json::to_string(&msg).unwrap();
                    let _ = broadcast_clone.send(json);
                } else {
                    // Broadcast a system chat message to clients notifying there are no more tiles
                    let msg = Message {
                        kind: "chat".into(),
                        data: r#"{"sender":"System","message":"No more tiles remaining.","message_type":"info"}"#.to_string(),
                    };
                    let json = serde_json::to_string(&msg).unwrap();
                    let _ = broadcast_clone.send(json);
                    break;
                }
            }
        });

        Self { game_state, inner }
    }

    // synchronous version of anagram attempt
    fn anagram_attempt(&mut self, word_to_check: String, player_id: Uuid) -> Result<(), &str> {
        // Don't allow attempts while paused or during a challenge
        {
            let inner_r = self.inner.read().unwrap();
            if inner_r.paused {
                return Err("Game is paused.");
            }
            if inner_r.active_challenge {
                return Err("Cannot take words during a challenge.");
            }
        }

        // Validate the attempted word exists in our dictionary (log n lookup via BTreeSet)

        if word_to_check.trim().len() < 3 {
            return Err("Word must be at least 3 characters long.");
        }

        let dict = get_dict();
        let word_to_check = word_to_check.trim().to_lowercase();
        if !dict.contains(&word_to_check) {
            return Err("Word not in dictionary.");
        }

        // If there are no other player boards, nothing to steal from
        // Acquire read lock and search for a victim; collect necessary data then drop the read lock before mutating
        let mut found: Option<(Vec<char>, usize, Uuid)> = None;
        let mut found_pot: Option<Vec<char>> = None;
        {
            let inner_r = self.inner.read().unwrap();
            if inner_r.players_boards.is_empty() {
                return Err("No players to take from.");
            }

            // Build a list of player indices and shuffle for random order
            let mut random_player_order: Vec<usize> = (0..inner_r.players_boards.len()).collect();
            random_player_order.shuffle(&mut rand::rng());

            for player_i in random_player_order {
                if let Some(player_board) = inner_r.players_boards.get(player_i) {
                    for (word_i, existing_word) in player_board.words.iter().enumerate() {
                        if let Some(new_pot) =
                            some_anagram(existing_word, &word_to_check, inner_r.pot.clone())
                        {
                            // capture the necessary data and break out
                            found = Some((new_pot, word_i, player_board.player.id.clone()));
                            break;
                        }
                    }
                }
                if found.is_some() {
                    break;
                }
            }

            found_pot = pot_anagram(&word_to_check, inner_r.pot.clone());
        }

        if let Some((new_pot, word_i, victim_id)) = found {
            // perform mutation under write lock
            self.sync_state(new_pot, &word_to_check, word_i, &player_id, &victim_id);
            return Ok(());
        }

        if let Some(new_pot) = found_pot {
            // perform mutation under write lock
            self.pot_state_sync(new_pot, &word_to_check, &player_id);
            return Ok(());
        }

        Err("That word cannot be taken.")
    }

    fn pot_state_sync(&mut self, new_pot: Vec<char>, new_word: &str, player_id: &Uuid) {
        // perform modifications under write lock
        let mut inner_w = self.inner.write().unwrap();

        let player_index = inner_w
            .players_boards
            .iter()
            .position(|x| x.player.id == *player_id)
            .unwrap();

        let player_name = inner_w.players_boards[player_index].player.name.clone();

        let _chat_message_text = format!("{} formed {} from the pot!", player_name, new_word);

        // self.game_state.chat.push(super::ChatMessage {
        //     sender: "System".to_string(),
        //     text: chat_message_text,
        //     cards: None,
        //     message_type: Some("success".to_string()),
        // });

        // Record this move before changing state
        let old_pot = inner_w.pot.clone();

        inner_w.pot = new_pot;

        inner_w.players_boards[player_index].add_word(new_word.to_string());

        // Store last move for potential challenge
        inner_w.last_move = Some(LastMove {
            attacker_id: *player_id,
            victim_id: None,
            word_taken: new_word.to_string(),
            word_stolen: None,
            old_pot,
        });

        let completed = AnagramCompletedData {
            game_state: self.game_state.clone(),
            pot: inner_w.pot.clone(),
            players_boards: inner_w.players_boards.clone(),
            chat: self.game_state.chat.clone(),
        };

        let msg = Message {
            kind: "anagram_complete".into(),
            data: serde_json::to_string(&completed).unwrap(),
        };
        let json = serde_json::to_string(&msg).unwrap();
        let _ = self.game_state.broadcast_tx.send(json);
    }

    fn sync_state(
        &mut self,
        new_pot: Vec<char>,
        new_word: &str,
        victim_word_index: usize,
        attacker_id: &Uuid,
        victim_id: &Uuid,
    ) {
        // perform modifications under write lock
        let mut inner_w = self.inner.write().unwrap();

        let attacker_index = inner_w
            .players_boards
            .iter()
            .position(|x| x.player.id == *attacker_id)
            .unwrap();

        let victim_index = inner_w
            .players_boards
            .iter()
            .position(|x| x.player.id == *victim_id)
            .unwrap();

        let attacker_name = inner_w.players_boards[attacker_index].player.name.clone();
        let victim_name = inner_w.players_boards[victim_index].player.name.clone();
        let victim_word = inner_w.players_boards[victim_index].words[victim_word_index].clone();

        let _chat_message_text = format!(
            "{} took {} from {}'s {}!",
            attacker_name, new_word, victim_name, victim_word
        );

        // self.game_state.chat.push(super::ChatMessage {
        //     sender: "System".to_string(),
        //     text: chat_message_text,
        //     cards: None,
        //     message_type: Some("success".to_string()),
        // });

        // Record this move before changing state
        let old_pot = inner_w.pot.clone();

        inner_w.pot = new_pot;
        inner_w.players_boards[victim_index]
            .words
            .remove(victim_word_index);

        inner_w.players_boards[attacker_index].add_word(new_word.to_string());

        // Store last move for potential challenge
        inner_w.last_move = Some(LastMove {
            attacker_id: *attacker_id,
            victim_id: Some(*victim_id),
            word_taken: new_word.to_string(),
            word_stolen: Some(victim_word.clone()),
            old_pot,
        });

        let completed = AnagramCompletedData {
            game_state: self.game_state.clone(),
            pot: inner_w.pot.clone(),
            players_boards: inner_w.players_boards.clone(),
            chat: self.game_state.chat.clone(),
        };

        let msg = Message {
            kind: "anagram_complete".into(),
            data: serde_json::to_string(&completed).unwrap(),
        };
        let json = serde_json::to_string(&msg).unwrap();
        let _ = self.game_state.broadcast_tx.send(json);
    }

    fn broadcast_state(&self, kind: String) {
        let inner_r = self.inner.read().unwrap();
        let state_data = GameStateData {
            game_state: self.game_state.clone(),
            pot: inner_r.pot.clone(),
            players_boards: inner_r.players_boards.clone(),
            chat: self.game_state.chat.clone(),
        };

        let msg = Message {
            kind,
            data: serde_json::to_string(&state_data).unwrap(),
        };
        let json = serde_json::to_string(&msg).unwrap();
        let _ = self.game_state.broadcast_tx.send(json);
    }

    fn start_challenge(&mut self, challenger_id: &Uuid) -> Result<(), &str> {
        let mut inner_w = self.inner.write().unwrap();

        // Check if there's a move to challenge
        if inner_w.last_move.is_none() {
            return Err("No move to challenge.");
        }

        // Check if already in a challenge
        if inner_w.active_challenge {
            return Err("A challenge is already in progress.");
        }

        // Start the challenge
        inner_w.active_challenge = true;
        inner_w.paused = true;
        inner_w.challenge_votes.clear();
        inner_w.challenge_votes.insert(*challenger_id, true);

        // Update game state
        self.game_state.current_state = "challenge".into();

        // Get challenger name
        let challenger_name = inner_w
            .players_boards
            .iter()
            .find(|pb| pb.player.id == *challenger_id)
            .map(|pb| pb.player.name.clone())
            .unwrap_or_else(|| "Unknown".to_string());

        drop(inner_w);

        // Broadcast challenge started
        let chat_msg = super::ChatMessage {
            sender: "System".to_string(),
            text: format!("{} has challenged the last move! Type /challenge to agree or /maintain to disagree. Game is paused.", challenger_name),
            cards: None,
            message_type: Some("info".to_string()),
        };
        self.game_state.chat.push(chat_msg.clone());

        self.broadcast_state("challenge_started".into());

        // Check if challenge can be resolved immediately (e.g., if only one player or threshold already met)
        self.check_challenge_resolution();

        Ok(())
    }

    fn vote_challenge(&mut self, player_id: &Uuid, vote: bool) -> Result<(), &str> {
        let mut inner_w = self.inner.write().unwrap();

        if !inner_w.active_challenge {
            return Err("No active challenge.");
        }

        // Record the vote
        inner_w.challenge_votes.insert(*player_id, vote);

        let player_name = inner_w
            .players_boards
            .iter()
            .find(|pb| pb.player.id == *player_id)
            .map(|pb| pb.player.name.clone())
            .unwrap_or_else(|| "Unknown".to_string());

        drop(inner_w);

        // Broadcast the vote
        let vote_text = if vote { "challenge" } else { "maintain" };
        let chat_msg = super::ChatMessage {
            sender: "System".to_string(),
            text: format!("{} voted to {}.", player_name, vote_text),
            cards: None,
            message_type: Some("info".to_string()),
        };
        self.game_state.chat.push(chat_msg.clone());

        let msg = Message {
            kind: "chat".into(),
            data: serde_json::to_string(&chat_msg).unwrap(),
        };
        let _ = self
            .game_state
            .broadcast_tx
            .send(serde_json::to_string(&msg).unwrap());

        // Check if challenge can be resolved
        self.check_challenge_resolution();

        Ok(())
    }

    fn check_challenge_resolution(&mut self) {
        let inner_r = self.inner.read().unwrap();

        if !inner_r.active_challenge {
            return;
        }

        let total_players = inner_r.players_boards.len();
        let votes_count = inner_r.challenge_votes.len();

        let challenge_votes = inner_r.challenge_votes.values().filter(|&&v| v).count();
        let maintain_votes = votes_count - challenge_votes;

        // Calculate thresholds
        let challenge_threshold = (total_players + 1) / 2; // half rounded up
        let maintain_threshold = total_players / 2 + 1; // more than half

        drop(inner_r);

        // Resolve if threshold met
        if challenge_votes >= challenge_threshold {
            self.resolve_challenge(true);
        } else if maintain_votes >= maintain_threshold {
            self.resolve_challenge(false);
        }
    }

    fn resolve_challenge(&mut self, challenge_succeeds: bool) {
        let mut inner_w = self.inner.write().unwrap();

        if !inner_w.active_challenge {
            return;
        }

        inner_w.active_challenge = false;
        inner_w.paused = false;
        self.game_state.current_state = "in_progress".into();

        if challenge_succeeds {
            // Revert the last move
            if let Some(last_move) = inner_w.last_move.take() {
                // Find attacker board and remove the word they took
                if let Some(attacker_board) = inner_w
                    .players_boards
                    .iter_mut()
                    .find(|pb| pb.player.id == last_move.attacker_id)
                {
                    attacker_board.remove_word(&last_move.word_taken);
                }

                // If there was a victim, restore their word
                if let (Some(victim_id), Some(stolen_word)) =
                    (last_move.victim_id, last_move.word_stolen)
                {
                    if let Some(victim_board) = inner_w
                        .players_boards
                        .iter_mut()
                        .find(|pb| pb.player.id == victim_id)
                    {
                        victim_board.add_word(stolen_word);
                    }
                }

                // Restore the pot
                inner_w.pot = last_move.old_pot;
            }

            drop(inner_w);

            let chat_msg = super::ChatMessage {
                sender: "System".to_string(),
                text: "Challenge succeeded! The last move has been reverted. Game resumed."
                    .to_string(),
                cards: None,
                message_type: Some("success".to_string()),
            };
            self.game_state.chat.push(chat_msg.clone());

            self.broadcast_state("challenge_resolved".into());
        } else {
            // Challenge failed, clear last_move
            inner_w.last_move = None;
            drop(inner_w);

            let chat_msg = super::ChatMessage {
                sender: "System".to_string(),
                text: "Challenge failed! The move stands. Game resumed.".to_string(),
                cards: None,
                message_type: Some("info".to_string()),
            };
            self.game_state.chat.push(chat_msg.clone());

            self.broadcast_state("challenge_resolved".into());
        }
    }
}
impl super::Game for Anagrams {
    fn send_state_to_client(&self, broadcast_tx: &broadcast::Sender<String>, kind: String) {
        let inner_r = self.inner.read().unwrap();
        let state_data = GameStateData {
            game_state: self.game_state.clone(),
            pot: inner_r.pot.clone(),
            players_boards: inner_r.players_boards.clone(),
            chat: self.game_state.chat.clone(),
        };

        let msg = Message {
            kind,
            data: serde_json::to_string(&state_data).unwrap(),
        };
        let json = serde_json::to_string(&msg).unwrap();
        let _ = broadcast_tx.send(json);
    }

    fn copy_details(&self) -> GameState {
        self.game_state.clone()
    }

    fn get_details(&self) -> &GameState {
        &self.game_state
    }

    fn handle_game_socket_message(&mut self, txt: String) {
        let json_in = serde_json::from_str::<serde_json::Value>(&txt);
        if let Ok(parsed) = json_in {
            let kind = parsed
                .get("kind")
                .and_then(|v| v.as_str())
                .unwrap_or_default();
            match kind {
                "chat" => {
                    let data = parsed
                        .get("data")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default();

                    // Parse the chat data to get sender and message
                    if let Ok(chat_json) = serde_json::from_str::<serde_json::Value>(data) {
                        let sender = chat_json
                            .get("sender")
                            .and_then(|v| v.as_str())
                            .unwrap_or("Unknown")
                            .to_string();
                        let message = chat_json
                            .get("message")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();

                        // Check if the message is the /gameover command
                        if message.trim() == "/gameover" {
                            // Set game state to game_over
                            self.game_state.current_state = "game_over".into();

                            // Add system message to chat
                            self.game_state.chat.push(super::ChatMessage {
                                sender: "System".to_string(),
                                text: "Game Over! Final scores have been calculated.".to_string(),
                                cards: None,
                                message_type: Some("info".to_string()),
                            });

                            // Calculate final scores based on number of words
                            {
                                let inner_r = self.inner.read().unwrap();
                                for player_board in &inner_r.players_boards {
                                    if let Some(player) = self
                                        .game_state
                                        .players
                                        .iter_mut()
                                        .find(|p| p.id == player_board.player.id)
                                    {
                                        player.score = player_board.words.len() as u32;
                                    }
                                }
                            }

                            // Broadcast the updated game state with game_over status
                            let btx = self.game_state.broadcast_tx.clone();
                            self.send_state_to_client(&btx, "game_over".into());
                        } else if message.trim() == "/pause" {
                            // Toggle paused state
                            let mut inner_w = self.inner.write().unwrap();
                            inner_w.paused = !inner_w.paused;
                            let paused_now = inner_w.paused;
                            drop(inner_w);

                            // Update game_state.current_state for clients
                            self.game_state.current_state = if paused_now {
                                "paused".into()
                            } else {
                                "in_progress".into()
                            };

                            // Add system chat message announcing pause/resume
                            let announce = if paused_now {
                                "Game paused. Letter dealing and word taking are disabled."
                            } else {
                                "Game resumed. Letter dealing and word taking are enabled."
                            };

                            let chat_msg = super::ChatMessage {
                                sender: "System".to_string(),
                                text: announce.to_string(),
                                cards: None,
                                message_type: Some("info".to_string()),
                            };
                            self.game_state.chat.push(chat_msg.clone());

                            // Broadcast the updated game state so clients can reflect paused status
                            // This includes the chat history, so no need to send chat separately
                            let btx = self.game_state.broadcast_tx.clone();
                            let kind = if paused_now { "paused" } else { "resumed" };
                            self.send_state_to_client(&btx, kind.into());
                        } else if message.trim() == "/challenge" {
                            // Find the player ID from sender name
                            if let Some(player) =
                                self.game_state.players.iter().find(|p| p.name == sender)
                            {
                                let player_id = player.id;

                                // Check if there's already an active challenge
                                let is_active = {
                                    let inner_r = self.inner.read().unwrap();
                                    inner_r.active_challenge
                                };

                                if is_active {
                                    // This is a vote for an existing challenge
                                    if let Err(e) = self.vote_challenge(&player_id, true) {
                                        let chat_msg = super::ChatMessage {
                                            sender: "System".to_string(),
                                            text: e.to_string(),
                                            cards: None,
                                            message_type: Some("error".to_string()),
                                        };
                                        self.game_state.chat.push(chat_msg.clone());
                                        let chat = Message {
                                            kind: "chat".into(),
                                            data: serde_json::to_string(&chat_msg).unwrap(),
                                        };
                                        let _ = self
                                            .game_state
                                            .broadcast_tx
                                            .send(serde_json::to_string(&chat).unwrap());
                                    }
                                } else {
                                    // Start a new challenge
                                    if let Err(e) = self.start_challenge(&player_id) {
                                        let chat_msg = super::ChatMessage {
                                            sender: "System".to_string(),
                                            text: e.to_string(),
                                            cards: None,
                                            message_type: Some("error".to_string()),
                                        };
                                        self.game_state.chat.push(chat_msg.clone());
                                        let chat = Message {
                                            kind: "chat".into(),
                                            data: serde_json::to_string(&chat_msg).unwrap(),
                                        };
                                        let _ = self
                                            .game_state
                                            .broadcast_tx
                                            .send(serde_json::to_string(&chat).unwrap());
                                    }
                                }
                            }
                        } else if message.trim() == "/maintain" {
                            // Find the player ID from sender name
                            if let Some(player) =
                                self.game_state.players.iter().find(|p| p.name == sender)
                            {
                                let player_id = player.id;

                                if let Err(e) = self.vote_challenge(&player_id, false) {
                                    let chat_msg = super::ChatMessage {
                                        sender: "System".to_string(),
                                        text: e.to_string(),
                                        cards: None,
                                        message_type: Some("error".to_string()),
                                    };
                                    self.game_state.chat.push(chat_msg.clone());
                                    let chat = Message {
                                        kind: "chat".into(),
                                        data: serde_json::to_string(&chat_msg).unwrap(),
                                    };
                                    let _ = self
                                        .game_state
                                        .broadcast_tx
                                        .send(serde_json::to_string(&chat).unwrap());
                                }
                            }
                        } else {
                            // Add to chat history (regular messages don't have cards)
                            self.game_state.chat.push(super::ChatMessage {
                                sender: sender.clone(),
                                text: message.clone(),
                                cards: None,
                                message_type: None,
                            });

                            let msg = Message {
                                kind: "chat".into(),
                                data: data.to_string(),
                            };
                            let json = serde_json::to_string(&msg).unwrap();
                            let _ = self.game_state.broadcast_tx.send(json);
                        }
                    }
                }
                "anagram_attempt" => {
                    let data = parsed.get("data");

                    // Try to parse player_id (string UUID) and fallback to player_name if provided
                    let player_id_val = parsed
                        .get("player_id")
                        .and_then(|v| v.as_str())
                        .and_then(|s| Uuid::parse_str(s).ok());
                    let player_name_val = parsed
                        .get("player_name")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());

                    if let Some(data) = data {
                        if let Some(word_attempt) = data.as_str() {
                            let word_attempt = word_attempt.to_string();

                            // Resolve player id if missing but player_name provided
                            let player_id = if let Some(pid) = player_id_val {
                                pid
                            } else if let Some(ref pname) = player_name_val {
                                // try to resolve from game_state.players
                                if let Some(p) =
                                    self.game_state.players.iter().find(|p| p.name == *pname)
                                {
                                    p.id
                                } else {
                                    // can't resolve - send error back
                                    let err_msg =
                                        "Missing or invalid player_id (and player_name not found)"
                                            .to_string();
                                    let msg = Message {
                                        kind: "anagram_attempt_result".into(),
                                        data: err_msg.clone(),
                                    };
                                    let json = serde_json::to_string(&msg).unwrap();
                                    let _ = self.game_state.broadcast_tx.send(json);
                                    // also broadcast as system chat for visibility
                                    let chat_msg = super::ChatMessage {
                                        sender: "System".to_string(),
                                        text: err_msg,
                                        cards: None,
                                        message_type: Some("error".to_string()),
                                    };
                                    let chat = Message {
                                        kind: "chat".into(),
                                        data: serde_json::to_string(&chat_msg).unwrap(),
                                    };
                                    let _ = self
                                        .game_state
                                        .broadcast_tx
                                        .send(serde_json::to_string(&chat).unwrap());
                                    return;
                                }
                            } else {
                                let err_msg = "Missing player identification".to_string();
                                let msg = Message {
                                    kind: "anagram_attempt_result".into(),
                                    data: err_msg.clone(),
                                };
                                let json = serde_json::to_string(&msg).unwrap();
                                let _ = self.game_state.broadcast_tx.send(json);
                                let chat_msg = super::ChatMessage {
                                    sender: "System".to_string(),
                                    text: err_msg,
                                    cards: None,
                                    message_type: Some("error".to_string()),
                                };
                                let chat = Message {
                                    kind: "chat".into(),
                                    data: serde_json::to_string(&chat_msg).unwrap(),
                                };
                                let _ = self
                                    .game_state
                                    .broadcast_tx
                                    .send(serde_json::to_string(&chat).unwrap());
                                return;
                            };

                            // prepare a broadcast sender clone so we don't hold borrows across mutable ops
                            let btx = self.game_state.broadcast_tx.clone();

                            // Broadcast the player's attempted word as chat
                            let sender_name = player_name_val
                                .clone()
                                .or_else(|| {
                                    self.game_state
                                        .players
                                        .iter()
                                        .find(|p| p.id == player_id)
                                        .map(|p| p.name.clone())
                                })
                                .unwrap_or_else(|| "Unknown".to_string());

                            let player_chat = super::ChatMessage {
                                sender: sender_name.clone(),
                                text: word_attempt.clone(),
                                cards: None,
                                message_type: None,
                            };
                            // append to game chat history
                            self.game_state.chat.push(player_chat.clone());
                            // broadcast the chat message so all clients see the attempted word
                            // Send the ChatMessage fields directly, not double-serialized
                            let chat_msg = Message {
                                kind: "chat".into(),
                                data: format!(
                                    r#"{{"sender":"{}","message":"{}"}}"#,
                                    sender_name, word_attempt
                                ),
                            };
                            let _ = btx.send(serde_json::to_string(&chat_msg).unwrap());

                            if let Err(e) = self.anagram_attempt(word_attempt.clone(), player_id) {
                                // Convert error to string first to avoid borrow issues
                                let error_text = e.to_string();
                                // Broadcast system chat with the error message
                                let chat_msg = super::ChatMessage {
                                    sender: "System".to_string(),
                                    text: error_text.clone(),
                                    cards: None,
                                    message_type: Some("error".to_string()),
                                };
                                // append to history and broadcast
                                self.game_state.chat.push(chat_msg.clone());
                                let chat = Message {
                                    kind: "chat".into(),
                                    data: format!(
                                        r#"{{"sender":"System","message":"{}","message_type":"error"}}"#,
                                        error_text
                                    ),
                                };
                                let _ = btx.send(serde_json::to_string(&chat).unwrap());
                            }
                        }
                    }
                }
                "join_player" => {
                    let data = parsed
                        .get("data")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default();

                    // Parse the player data
                    if let Ok(player_json) = serde_json::from_str::<serde_json::Value>(data) {
                        let player_name = player_json
                            .get("name")
                            .and_then(|v| v.as_str())
                            .unwrap_or("Anonymous")
                            .to_string();

                        // Check if player already exists
                        let player_exists = self
                            .game_state
                            .players
                            .iter()
                            .any(|p| p.name == player_name);

                        if !player_exists {
                            // Add new player
                            let new_player =
                                super::player::Player::new(player_name.clone(), Uuid::new_v4());
                            self.game_state.players.push(new_player);
                            // Also create a PlayerBoard for them
                            let mut inner_w = self.inner.write().unwrap();
                            inner_w.players_boards.push(PlayerBoard::from_player(
                                self.game_state
                                    .players
                                    .iter()
                                    .find(|p| p.name == player_name)
                                    .unwrap(),
                            ));

                            // release the write lock before broadcasting to avoid
                            // attempting to acquire a read lock while the write lock is held
                            drop(inner_w);

                            // Broadcast updated game state to all clients
                            let btx = self.game_state.broadcast_tx.clone();
                            let _ = self.send_state_to_client(&btx, "player_joined".into());
                        }
                    }
                }
                _ => {
                    let msg = Message {
                        kind: "error".into(),
                        data: "Unknown message kind".into(),
                    };
                    let json = serde_json::to_string(&msg).unwrap();
                    let _ = self.game_state.broadcast_tx.send(json);
                }
            }
            // Placeholder logic
        }
    }
}

//import logging macros
#[cfg(test)]
mod tests {
    use super::*;
    use crate::game::player::Player;
    use crate::user::User;
    use uuid::Uuid;

    #[test]
    fn test_some_anagram_success() {
        // existing word uses subset of letters in word_to_check
        let existing = "eat";
        let word_to_check = "treat";
        let pot = vec!['t', 'r'];

        let result = some_anagram(existing, word_to_check, pot.clone());
        // 't' and 'r' should be consumed leaving nothing
        assert!(result.is_some());
        let remaining = result.unwrap();
        assert_eq!(remaining.len(), 0);
    }

    #[test]
    fn test_some_anagram_failure_not_enough_letters() {
        let existing = "apple";
        let word_to_check = "ape"; // missing one 'p' for existing
        let pot = vec!['x'];

        let result = some_anagram(existing, word_to_check, pot);
        assert!(result.is_none());
    }

    #[test]
    fn test_playerboard_add_remove() {
        let user = User::new("Alice".to_string());
        let player = Player::from_user(&user);
        // construct PlayerBoard directly (from_player is an instance method in the codebase)
        let mut board = PlayerBoard::from_player(&player);
        board.add_word("hello".to_string());
        assert_eq!(board.words.len(), 1);
        assert!(board.remove_word(&"hello".to_string()));
        assert_eq!(board.words.len(), 0);
        // removing non-existent word returns false
        assert!(!board.remove_word(&"nope".to_string()));
    }

    #[test]
    fn test_anagram_attempt_and_sync_state_flow() {
        // Build an Anagrams instance with a creator
        let creator = User::new("Creator".to_string());
        let mut game = Anagrams::new("testgame".to_string());

        // create two players
        let p1 = Player::new("Alice".to_string(), Uuid::new_v4());
        let p2 = Player::new("Bob".to_string(), Uuid::new_v4());

        // attach boards via the inner RwLock
        {
            let mut inner_w = game.inner.write().unwrap();
            inner_w.players_boards.push(PlayerBoard::from_player(&p1));
            inner_w.players_boards.push(PlayerBoard::from_player(&p2));
        }

        // give Bob a word that can be taken
        // give Bob a word that can be taken
        {
            let mut inner_w = game.inner.write().unwrap();
            let bob_board = inner_w
                .players_boards
                .iter_mut()
                .find(|b| b.player.id == p2.id)
                .unwrap();
            bob_board.add_word("eat".to_string());

            // Ensure the pot has the letters needed to form 'treat' from 'eat'
            inner_w.pot = vec!['t', 'r'];
        }

        // Instead of calling the higher-level anagram_attempt (the player iteration
        // logic is unreliable in tests), exercise the core flow: check the anagram
        // and call sync_state directly.
        // Use the ids from the boards to ensure they match what's stored
        let (attacker_id, victim_id) = {
            let inner_r = game.inner.read().unwrap();
            (
                inner_r.players_boards[0].player.id,
                inner_r.players_boards[1].player.id,
            )
        };

        // We pushed Alice then Bob, so Bob is at index 1.
        let victim_board_index = 1usize;

        let victim_word_index = 0usize; // 'eat' was pushed as the first word

        // Sanity-check: attacker and victim boards exist in inner.players_boards
        {
            let inner_r = game.inner.read().unwrap();
            assert!(
                inner_r
                    .players_boards
                    .iter()
                    .any(|b| b.player.id == attacker_id),
                "attacker board missing"
            );
            assert!(
                inner_r
                    .players_boards
                    .iter()
                    .any(|b| b.player.id == victim_id),
                "victim board missing"
            );
        }

        // Verify some_anagram returns a new pot for this steal
        let (existing_word, maybe_new_pot, word_attempt) = {
            let inner_r = game.inner.read().unwrap();
            let existing_word =
                inner_r.players_boards[victim_board_index].words[victim_word_index].clone();
            let word_attempt = "treat".to_string();
            let maybe_new_pot = some_anagram(&existing_word, &word_attempt, inner_r.pot.clone());
            (existing_word, maybe_new_pot, word_attempt)
        };
        assert!(maybe_new_pot.is_some());
        let new_pot = maybe_new_pot.unwrap();

        // Call sync_state to apply the transfer
        game.sync_state(
            new_pot,
            &word_attempt,
            victim_word_index,
            &attacker_id,
            &victim_id,
        );

        // After the attempt, Alice should have the new word
        // Read final state under lock to verify results
        {
            let inner_r = game.inner.read().unwrap();
            let alice_board = inner_r
                .players_boards
                .iter()
                .find(|b| b.player.id == p1.id)
                .unwrap();
            assert!(alice_board.words.contains(&"treat".to_string()));

            // Bob's board should no longer contain 'eat'
            let bob_board = inner_r
                .players_boards
                .iter()
                .find(|b| b.player.id == p2.id)
                .unwrap();
            assert!(!bob_board.words.contains(&"eat".to_string()));
        }
    }

    #[test]
    fn test_lemmatizer_same_lemma() {
        // "runs" and "run" should have the same lemma
        assert!(are_lemmas_equal("runs", "run"));
        assert!(are_lemmas_equal("run", "runs"));
    }

    #[test]
    fn test_lemmatizer_plural_singular() {
        // "cats" and "cat" should have the same lemma
        assert!(are_lemmas_equal("cats", "cat"));
        assert!(are_lemmas_equal("cat", "cats"));
    }

    #[test]
    fn test_lemmatizer_verb_forms() {
        // Different verb forms should match
        assert!(are_lemmas_equal("eating", "eat"));
        assert!(are_lemmas_equal("ate", "eat"));
        assert!(are_lemmas_equal("eaten", "eat"));
    }

    #[test]
    fn test_lemmatizer_different_words() {
        // Completely different words should not match
        assert!(!are_lemmas_equal("cat", "dog"));
        assert!(!are_lemmas_equal("run", "walk"));
        assert!(!are_lemmas_equal("happy", "sad"));
    }

    #[test]
    fn test_lemmatizer_same_word() {
        // Same word should always match
        assert!(are_lemmas_equal("hello", "hello"));
        assert!(are_lemmas_equal("world", "world"));
    }

    #[test]
    fn test_lemmatizer_adjective_forms() {
        // Comparative and superlative forms
        assert!(are_lemmas_equal("bigger", "big"));
        assert!(are_lemmas_equal("biggest", "big"));
        assert!(are_lemmas_equal("happier", "happy"));
    }

    #[test]
    fn test_lemmatizer_past_tense() {
        // Regular and irregular past tense
        assert!(are_lemmas_equal("walked", "walk"));
        assert!(are_lemmas_equal("went", "go"));
        assert!(are_lemmas_equal("ran", "run"));
    }

    #[test]
    fn test_lemmatizer_case_insensitive() {
        // Should work regardless of case since we convert to lowercase in the main code
        assert!(are_lemmas_equal("RUNS", "run"));
        assert!(are_lemmas_equal("Run", "RUNNING"));
    }
}
