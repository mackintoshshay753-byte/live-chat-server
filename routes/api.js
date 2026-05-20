const express = require('express');
const router  = express.Router();

const { onlineUsers }          = require('../sockets');
const { getProfileById, clean } = require('../helpers');
const { data }                  = require('../data');

// ─── Constants ────────────────────────────────────────────────
const SEARCH_MIN   = 3;
const SEARCH_MAX   = 40;   // reject absurdly long queries early
const PAGE_SIZE    = 12;
const MAX_PAGE     = 1000; // sanity ceiling

// ─── GET /api/profile/:id ─────────────────────────────────────
router.get('/profile/:id', (req, res) => {
  try {
    const profile = getProfileById(req.params.id);
    if (!profile) return res.status(404).json({ error: 'User not found' });

    res.json({
      id:         profile.id,
      username:   profile.username,
      joinDate:   profile.joinDate,
      lastOnline: profile.lastOnline ?? null,
      theme:      profile.theme,
      bio:        profile.bio ?? '',
    });
  } catch (err) {
    console.error('Profile API error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// NOTE: POST /api/profile/update-bio has been removed.
// Bio updates go through the authenticated Socket.IO "update bio"
// event, which ties the update to a verified socket session.
// A REST endpoint with only a userId in the body has no way to
// verify the caller owns that account.

// ─── GET /api/search/users ────────────────────────────────────
router.get('/search/users', (req, res) => {
  try {
    const raw     = clean(req.query.keyword || '');
    const page    = Math.min(parseInt(req.query.page, 10) || 1, MAX_PAGE);

    // Reject queries that are too short or too long before scanning
    if (raw.length < SEARCH_MIN || raw.length > SEARCH_MAX) {
      return res.json({ results: [], total: 0, page: 1, pages: 0 });
    }

    const keyword = raw.toLowerCase();
    const matches = [];

    for (const [username, info] of Object.entries(data.accounts)) {
      if (!username.toLowerCase().includes(keyword)) continue;

      matches.push({
        id:       info.id,
        username,
        isOnline: onlineUsers.has(username),
        // lastOnline intentionally omitted from search results —
        // returning it unauthenticated lets anyone track activity patterns.
      });
    }

    matches.sort((a, b) => a.username.localeCompare(b.username));

    const total   = matches.length;
    const pages   = Math.ceil(total / PAGE_SIZE);
    const start   = (page - 1) * PAGE_SIZE;
    const results = matches.slice(start, start + PAGE_SIZE);

    res.json({ results, total, page, pages });
  } catch (err) {
    console.error('Search API error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;