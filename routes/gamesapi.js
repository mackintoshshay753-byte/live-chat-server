const express = require('express');
const router = express.Router();
const { data, saveData } = require('../data'); // Uses your central data/index.js

// ✅ GET all games
router.get('/', (req, res) => {
  res.json(data.games);
});

// ✅ GET single game by ID
router.get('/:id', (req, res) => {
  const game = data.games.find(g => g.id === parseInt(req.params.id));
  if (!game) return res.status(404).json({ success: false, error: "Game not found" });
  res.json(game);
});

// ✅ CREATE new game
router.post('/', (req, res) => {
  const {
    name,
    description,
    thumbnailUrl,
    maxPlayers,
    genre,
    creatorId,
    creatorName,
    playing = 0,
    favorites = 0,
    visits = 0,
    likes = 0,
    dislikes = 0,
    servers = []
  } = req.body;

  if (!name || !creatorId || !creatorName) {
    return res.status(400).json({ success: false, error: "Missing required fields" });
  }

  const newGame = {
    id: data.nextGameId,
    name,
    description: description || "",
    thumbnailUrl: thumbnailUrl || "https://tr.rbxcdn.com/180DAY-63c9d152e01b1c0fc8a7d87e63f4cbc1/420/420/Decal/Webp/noFilter",
    maxPlayers: maxPlayers || 16,
    genre: genre || "All",
    creatorId,
    creatorName,
    createdDate: new Date().toISOString(),
    playing,
    favorites,
    visits,
    likes,
    dislikes,
    servers
  };

  data.games.push(newGame);
  data.nextGameId++;
  saveData(); // Saves to chat-data.json — same as groups/friends

  res.json({ success: true, gameId: newGame.id });
});

// ✅ UPDATE game
router.put('/:id', (req, res) => {
  const index = data.games.findIndex(g => g.id === parseInt(req.params.id));
  if (index === -1) return res.status(404).json({ success: false, error: "Game not found" });

  data.games[index] = { ...data.games[index], ...req.body, id: parseInt(req.params.id) };
  saveData();
  res.json({ success: true, game: data.games[index] });
});

// ✅ DELETE game
router.delete('/:id', (req, res) => {
  const beforeLength = data.games.length;
  data.games = data.games.filter(g => g.id !== parseInt(req.params.id));

  if (data.games.length === beforeLength) {
    return res.status(404).json({ success: false, error: "Game not found" });
  }

  saveData();
  res.json({ success: true });
});

module.exports = router;