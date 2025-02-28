const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const path = require('path');
const fs = require('fs');

// Create Express app
const app = express();
const PORT = 123;

// Enable CORS for all routes
app.use(cors());

// Parse JSON and URL-encoded bodies
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Store player data
const players = new Map();

// Rate limiting variables
const rateLimits = new Map();
const MAX_REQUESTS = 20;
const TIME_WINDOW = 10000; // 10 seconds

// Function to check if a client is rate limited
function isRateLimited(clientIp) {
    const now = Date.now();
    
    if (!rateLimits.has(clientIp)) {
        rateLimits.set(clientIp, {
            count: 1,
            firstRequest: now
        });
        return false;
    }
    
    const limit = rateLimits.get(clientIp);
    
    // Reset if outside time window
    if (now - limit.firstRequest > TIME_WINDOW) {
        rateLimits.set(clientIp, {
            count: 1,
            firstRequest: now
        });
        return false;
    }
    
    // Increment counter
    limit.count++;
    
    // Check if rate limited
    return limit.count > MAX_REQUESTS;
}

// Function to validate player data
function isValidPlayerData(data) {
    // Check for required fields
    const requiredFields = [
        'playerName', 'displayName', 'gameName', 
        'serverPlayers', 'maxPlayers', 'placeId', 
        'jobId', 'currentTime', 'country', 'executor', 'version'
    ];
    
    for (const field of requiredFields) {
        if (data[field] === undefined) {
            return false;
        }
    }
    
    // Validate numeric fields
    if (isNaN(parseInt(data.serverPlayers)) || isNaN(parseInt(data.maxPlayers))) {
        return false;
    }
    
    return true;
}

// Function to sanitize player data to prevent XSS
function sanitizePlayerData(data) {
    const sanitized = {};
    
    for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'string') {
            sanitized[key] = value
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        } else {
            sanitized[key] = value;
        }
    }
    
    return sanitized;
}

// Endpoint to receive player data
app.post('/server/api/player', (req, res) => {
    const clientIp = req.ip;
    
    // Apply rate limiting
    if (isRateLimited(clientIp)) {
        return res.status(429).json({ error: 'Rate limit exceeded' });
    }
    
    try {
        const data = req.body;
        
        // Basic validation
        if (!isValidPlayerData(data)) {
            return res.status(400).json({ error: 'Invalid player data' });
        }
        
        // Create a unique player ID
        const playerId = `${data.playerName}-${data.jobId}`;
        
        // Store or update player data
        players.set(playerId, {
            ...data,
            lastUpdated: new Date(),
            ip: clientIp
        });
        
        console.log(`Updated player data for ${data.playerName} in ${data.gameName}`);
        
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error processing player data:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// Endpoint to get all player data
app.get('/server/api/players', (req, res) => {
    const playerList = Array.from(players.values())
        .map(player => {
            // Remove the IP address before sending
            const { ip, ...playerData } = player;
            return sanitizePlayerData(playerData);
        });
    
    return res.status(200).json(playerList);
});

// Serve the HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Create HTML file with the player tracker
const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Player Tracker</title>
    <style>
        :root {
            --primary-color: #3a86ff;
            --secondary-color: #8338ec;
            --background-color: #f8f9fa;
            --card-color: #ffffff;
            --text-color: #212529;
            --border-color: #dee2e6;
            --online-color: #2ecc71;
            --dark-mode-bg: #222;
            --dark-mode-card: #333;
            --dark-mode-text: #eee;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: var(--background-color);
            color: var(--text-color);
            margin: 0;
            padding: 0;
            transition: background-color 0.3s, color 0.3s;
        }

        body.dark-mode {
            background-color: var(--dark-mode-bg);
            color: var(--dark-mode-text);
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }

        header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 20px;
            border-bottom: 1px solid var(--border-color);
        }

        header h1 {
            margin: 0;
            background: linear-gradient(45deg, var(--primary-color), var(--secondary-color));
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
            font-size: 2rem;
        }

        .controls {
            display: flex;
            gap: 10px;
            align-items: center;
        }

        .theme-switch {
            display: inline-block;
            position: relative;
            width: 60px;
            height: 30px;
        }

        .theme-switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }

        .slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: #ccc;
            transition: .4s;
            border-radius: 30px;
        }

        .slider:before {
            position: absolute;
            content: "";
            height: 22px;
            width: 22px;
            left: 4px;
            bottom: 4px;
            background-color: white;
            transition: .4s;
            border-radius: 50%;
        }

        input:checked + .slider {
            background-color: var(--primary-color);
        }

        input:checked + .slider:before {
            transform: translateX(30px);
        }

        #status-container {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 20px;
            padding: 15px;
            border-radius: 8px;
            background-color: var(--card-color);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        }

        body.dark-mode #status-container {
            background-color: var(--dark-mode-card);
        }

        .status-indicator {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background-color: #f44336;
        }

        .status-indicator.online {
            background-color: var(--online-color);
        }

        .stats {
            display: flex;
            flex-wrap: wrap;
            gap: 20px;
            margin-bottom: 20px;
        }

        .stat-card {
            flex: 1;
            min-width: 200px;
            background-color: var(--card-color);
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
            transition: transform 0.3s, box-shadow 0.3s;
        }

        body.dark-mode .stat-card {
            background-color: var(--dark-mode-card);
        }

        .stat-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 6px 12px rgba(0, 0, 0, 0.1);
        }

        .stat-card h3 {
            margin-top: 0;
            color: var(--primary-color);
            font-size: 1.2rem;
        }

        .stat-card p {
            font-size: 2rem;
            font-weight: bold;
            margin: 10px 0 0 0;
        }

        .player-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 20px;
        }

        .player-card {
            background-color: var(--card-color);
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
            transition: transform 0.3s, box-shadow 0.3s;
            position: relative;
        }

        body.dark-mode .player-card {
            background-color: var(--dark-mode-card);
        }

        .player-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 6px 12px rgba(0, 0, 0, 0.1);
        }

        .player-card h3 {
            margin-top: 0;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .player-status {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background-color: var(--online-color);
            display: inline-block;
        }

        .player-card div {
            margin: 8px 0;
            display: flex;
            justify-content: space-between;
        }

        .player-card div span:first-child {
            font-weight: 500;
            color: var(--secondary-color);
        }

        .player-card div span:last-child {
            text-align: right;
        }

        .player-actions {
            position: absolute;
            top: 15px;
            right: 15px;
        }

        .player-actions button {
            background: none;
            border: none;
            cursor: pointer;
            color: #777;
            transition: color 0.3s;
        }

        .player-actions button:hover {
            color: #f44336;
        }

        .hide {
            display: none !important;
        }

        .loader {
            display: flex;
            justify-content: center;
            align-items: center;
            height: 300px;
        }

        .loader div {
            width: 20px;
            height: 20px;
            margin: 0 5px;
            background: var(--primary-color);
            border-radius: 50%;
            animation: loader 1.5s infinite ease-in-out;
        }

        .loader div:nth-child(2) {
            animation-delay: 0.2s;
            background: var(--secondary-color);
        }

        .loader div:nth-child(3) {
            animation-delay: 0.4s;
        }

        @keyframes loader {
            0%, 100% {
                transform: scale(0.3);
            }
            50% {
                transform: scale(1);
            }
        }

        .empty-state {
            text-align: center;
            padding: 40px;
            background-color: var(--card-color);
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        }

        body.dark-mode .empty-state {
            background-color: var(--dark-mode-card);
        }

        .empty-state h3 {
            margin-top: 0;
            color: var(--primary-color);
        }

        .timestamp {
            font-size: 0.8rem;
            color: #777;
            text-align: right;
            margin-top: 10px;
        }

        @media (max-width: 768px) {
            .stats {
                flex-direction: column;
            }
            .player-grid {
                grid-template-columns: 1fr;
            }
        }
        
        .tooltip {
            position: relative;
            display: inline-block;
            cursor: help;
        }

        .tooltip .tooltip-text {
            visibility: hidden;
            width: 120px;
            background-color: #555;
            color: #fff;
            text-align: center;
            border-radius: 6px;
            padding: 5px;
            position: absolute;
            z-index: 1;
            bottom: 125%;
            left: 50%;
            margin-left: -60px;
            opacity: 0;
            transition: opacity 0.3s;
        }

        .tooltip:hover .tooltip-text {
            visibility: visible;
            opacity: 1;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>Player Tracker</h1>
            <div class="controls">
                <label class="theme-switch">
                    <input type="checkbox" id="theme-toggle">
                    <span class="slider"></span>
                </label>
                <span id="theme-label">Dark Mode</span>
            </div>
        </header>

        <div id="status-container">
            <div class="status-indicator" id="connection-status"></div>
            <span id="status-text">Disconnected</span>
        </div>

        <div class="stats">
            <div class="stat-card">
                <h3>Active Players</h3>
                <p id="active-players">0</p>
            </div>
            <div class="stat-card">
                <h3>Unique Games</h3>
                <p id="unique-games">0</p>
            </div>
            <div class="stat-card">
                <h3>Last Updated</h3>
                <p id="last-updated">-</p>
            </div>
        </div>

        <div id="player-container">
            <div class="loader" id="loader">
                <div></div>
                <div></div>
                <div></div>
            </div>
            <div class="empty-state hide" id="empty-state">
                <h3>No Players Connected</h3>
                <p>Waiting for connections...</p>
            </div>
            <div class="player-grid hide" id="player-grid"></div>
        </div>
    </div>

    <script>
        document.addEventListener('DOMContentLoaded', function() {
            // DOM Elements
            const connectionStatus = document.getElementById('connection-status');
            const statusText = document.getElementById('status-text');
            const activePlayersEl = document.getElementById('active-players');
            const uniqueGamesEl = document.getElementById('unique-games');
            const lastUpdatedEl = document.getElementById('last-updated');
            const playerGrid = document.getElementById('player-grid');
            const loader = document.getElementById('loader');
            const emptyState = document.getElementById('empty-state');
            const themeToggle = document.getElementById('theme-toggle');
            const themeLabel = document.getElementById('theme-label');

            // State variables
            let players = [];
            let intervalId = null;
            let lastCheckTime = null;

            // Theme toggle
            themeToggle.addEventListener('change', function() {
                if (this.checked) {
                    document.body.classList.add('dark-mode');
                    themeLabel.textContent = 'Light Mode';
                    localStorage.setItem('theme', 'dark');
                } else {
                    document.body.classList.remove('dark-mode');
                    themeLabel.textContent = 'Dark Mode';
                    localStorage.setItem('theme', 'light');
                }
            });

            // Load saved theme
            if (localStorage.getItem('theme') === 'dark') {
                document.body.classList.add('dark-mode');
                themeToggle.checked = true;
                themeLabel.textContent = 'Light Mode';
            }

            // Format date
            function formatDate(date) {
                if (!(date instanceof Date)) return '-';
                
                const hours = date.getHours().toString().padStart(2, '0');
                const minutes = date.getMinutes().toString().padStart(2, '0');
                const seconds = date.getSeconds().toString().padStart(2, '0');
                
                return \`\${hours}:\${minutes}:\${seconds}\`;
            }

            // Show/hide UI elements
            function showLoader() {
                loader.classList.remove('hide');
            }
            
            function hideLoader() {
                loader.classList.add('hide');
            }
            
            function showEmptyState() {
                emptyState.classList.remove('hide');
            }
            
            function hideEmptyState() {
                emptyState.classList.add('hide');
            }
            
            function showPlayerGrid() {
                hideLoader();
                playerGrid.classList.remove('hide');
            }
            
            function hidePlayerGrid() {
                playerGrid.classList.add('hide');
            }

            // Create a player card
            function createPlayerCard(player) {
                const card = document.createElement('div');
                card.className = 'player-card';
                card.id = \`player-\${player.playerName}-\${player.jobId}\`;
                
                // Player name and status
                const header = document.createElement('h3');
                const status = document.createElement('span');
                status.className = 'player-status';
                header.appendChild(status);
                header.appendChild(document.createTextNode(player.displayName || player.playerName));
                card.appendChild(header);
                
                // Player actions
                const actions = document.createElement('div');
                actions.className = 'player-actions';
                const removeBtn = document.createElement('button');
                removeBtn.innerHTML = '&times;';
                removeBtn.title = 'Remove player';
                removeBtn.onclick = function() {
                    const index = players.findIndex(p => p.playerName === player.playerName && p.jobId === player.jobId);
                    if (index !== -1) {
                        players.splice(index, 1);
                        updatePlayerCount();
                        updatePlayerGrid();
                    }
                };
                actions.appendChild(removeBtn);
                card.appendChild(actions);
                
                // Player details
                addDetailRow(card, 'Username', player.playerName);
                addDetailRow(card, 'Game', player.gameName);
                addDetailRow(card, 'Players', \`\${player.serverPlayers}/\${player.maxPlayers}\`);
                addDetailRow(card, 'Place ID', player.placeId);
                addDetailRow(card, 'Job ID', player.jobId);
                addDetailRow(card, 'Country', player.country);
                addDetailRow(card, 'Executor', player.executor);
                addDetailRow(card, 'Version', player.version);
                
                // Add timestamp
                const timestamp = document.createElement('div');
                timestamp.className = 'timestamp';
                timestamp.textContent = formatDate(new Date(player.lastUpdated));
                card.appendChild(timestamp);
                
                return card;
            }

            // Add a detail row to a player card
            function addDetailRow(card, label, value) {
                const row = document.createElement('div');
                
                const labelEl = document.createElement('span');
                labelEl.textContent = label + ':';
                
                const valueEl = document.createElement('span');
                valueEl.textContent = value;
                
                row.appendChild(labelEl);
                row.appendChild(valueEl);
                
                card.appendChild(row);
            }

            // Update player count and unique games
            function updatePlayerCount() {
                activePlayersEl.textContent = players.length;
                
                // Count unique games
                const uniqueGames = new Set();
                players.forEach(player => {
                    uniqueGames.add(player.gameName);
                });
                uniqueGamesEl.textContent = uniqueGames.size;
                
                // Show/hide empty state
                if (players.length === 0) {
                    showEmptyState();
                    hidePlayerGrid();
                } else {
                    hideEmptyState();
                    showPlayerGrid();
                }
            }

            // Update the player grid
            function updatePlayerGrid() {
                // Clear existing grid
                playerGrid.innerHTML = '';
                
                // Add player cards
                players.forEach(player => {
                    const playerCard = createPlayerCard(player);
                    playerGrid.appendChild(playerCard);
                });
            }

            // Update last updated time
            function updateLastUpdated() {
                lastUpdatedEl.textContent = formatDate(new Date());
                lastCheckTime = new Date();
            }

            // Fetch player data from the server
            function fetchPlayerData() {
                fetch('https://brickhublua.github.io/server//api/players')
                    .then(response => {
                        if (response.ok) {
                            connectionStatus.classList.add('online');
                            statusText.textContent = 'Connected';
                            return response.json();
                        } else {
                            throw new Error('Failed to fetch player data');
                        }
                    })
                    .then(data => {
                        players = data;
                        updatePlayerCount();
                        updatePlayerGrid();
                        updateLastUpdated();
                        hideLoader();
                    })
                    .catch(error => {
                        console.error('Error fetching player data:', error);
                        connectionStatus.classList.remove('online');
                        statusText.textContent = 'Connection Error';
                    });
            }

            // Start periodic polling
            function startPolling() {
                showLoader();
                
                // Initial fetch
                fetchPlayerData();
                
                // Set up interval for periodic fetching
                intervalId = setInterval(fetchPlayerData, 5000);
            }

            // Start the application
            startPolling();
        });
    </script>
</body>
</html>`;

// Write the HTML file
fs.writeFileSync(path.join(__dirname, 'index.html'), htmlContent);

// Start the server
const server = http.createServer(app);

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});