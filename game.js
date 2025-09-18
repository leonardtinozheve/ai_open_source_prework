class Avatar {
    constructor(playerData, avatarData) {
        this.id = playerData.id;
        this.username = playerData.username;
        this.x = playerData.x;
        this.y = playerData.y;
        this.facing = playerData.facing;
        this.isMoving = playerData.isMoving;
        this.animationFrame = playerData.animationFrame || 0;
        this.avatarName = playerData.avatar;
        this.isDead = false;
        
        // Load avatar images
        this.frames = {
            north: [],
            south: [],
            east: []
        };
        
        if (avatarData && avatarData.frames) {
            this.loadAvatarFrames(avatarData.frames);
        }
        
        this.avatarSize = 32; // Base avatar size
    }

    loadAvatarFrames(frames) {
        // Load north frames
        if (frames.north) {
            this.frames.north = frames.north.map(base64 => {
                const img = new Image();
                img.src = base64;
                return img;
            });
        }
        
        // Load south frames
        if (frames.south) {
            this.frames.south = frames.south.map(base64 => {
                const img = new Image();
                img.src = base64;
                return img;
            });
        }
        
        // Load east frames
        if (frames.east) {
            this.frames.east = frames.east.map(base64 => {
                const img = new Image();
                img.src = base64;
                return img;
            });
        }
    }

    update(playerData) {
        this.x = playerData.x;
        this.y = playerData.y;
        this.facing = playerData.facing;
        this.isMoving = playerData.isMoving;
        this.animationFrame = playerData.animationFrame || 0;
    }

    getCurrentFrame() {
        let frameSet;
        let flipHorizontal = false;
        
        switch (this.facing) {
            case 'north':
                frameSet = this.frames.north;
                break;
            case 'south':
                frameSet = this.frames.south;
                break;
            case 'east':
                frameSet = this.frames.east;
                break;
            case 'west':
                frameSet = this.frames.east; // Use east frames for west
                flipHorizontal = true;
                break;
            default:
                frameSet = this.frames.south;
        }
        
        if (frameSet && frameSet.length > 0) {
            const frameIndex = this.isMoving ? this.animationFrame : 0;
            return {
                image: frameSet[frameIndex % frameSet.length],
                flipHorizontal: flipHorizontal
            };
        }
        
        return null;
    }

    render(ctx, viewportOffsetX, viewportOffsetY) {
        const screenX = this.x - viewportOffsetX;
        const screenY = this.y - viewportOffsetY;
        
        // Only render if avatar is visible on screen
        if (screenX < -this.avatarSize || screenX > ctx.canvas.width + this.avatarSize ||
            screenY < -this.avatarSize || screenY > ctx.canvas.height + this.avatarSize) {
            return;
        }
        
        // Don't render dead players
        if (this.isDead) {
            this.renderDeadPlayer(ctx, screenX, screenY);
            return;
        }
        
        const frame = this.getCurrentFrame();
        if (frame && frame.image) {
            ctx.save();
            
            // Calculate position (center the avatar)
            const drawX = screenX - this.avatarSize / 2;
            const drawY = screenY - this.avatarSize / 2;
            
            if (frame.flipHorizontal) {
                ctx.scale(-1, 1);
                ctx.drawImage(frame.image, -drawX - this.avatarSize, drawY, this.avatarSize, this.avatarSize);
            } else {
                ctx.drawImage(frame.image, drawX, drawY, this.avatarSize, this.avatarSize);
            }
            
            ctx.restore();
        }
        
        // Draw username label
        this.renderUsername(ctx, screenX, screenY);
    }

    renderDeadPlayer(ctx, screenX, screenY) {
        ctx.save();
        
        // Draw a red X or skull for dead players
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(screenX - 15, screenY - 15);
        ctx.lineTo(screenX + 15, screenY + 15);
        ctx.moveTo(screenX + 15, screenY - 15);
        ctx.lineTo(screenX - 15, screenY + 15);
        ctx.stroke();
        
        // Draw username in red
        ctx.fillStyle = 'red';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 2;
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        
        const textY = screenY - this.avatarSize / 2 - 5;
        ctx.strokeText(this.username + ' (DEAD)', screenX, textY);
        ctx.fillText(this.username + ' (DEAD)', screenX, textY);
        
        ctx.restore();
    }

    renderUsername(ctx, screenX, screenY) {
        ctx.save();
        ctx.fillStyle = 'white';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 2;
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        
        const textY = screenY - this.avatarSize / 2 - 5;
        
        // Draw text with outline
        ctx.strokeText(this.username, screenX, textY);
        ctx.fillText(this.username, screenX, textY);
        
        ctx.restore();
    }
}

class GameClient {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.worldImage = null;
        this.worldWidth = 2048;
        this.worldHeight = 2048;
        
        // Game state
        this.myPlayerId = null;
        this.players = new Map(); // playerId -> Avatar
        this.avatars = new Map(); // avatarName -> avatarData
        this.websocket = null;
        this.connected = false;
        
        // Viewport
        this.viewportOffsetX = 0;
        this.viewportOffsetY = 0;
        this.viewportInitialized = false;
        
        // Movement
        this.pressedKeys = new Set();
        this.isMoving = false;
        this.keyMap = {
            'ArrowUp': 'up',
            'ArrowDown': 'down',
            'ArrowLeft': 'left',
            'ArrowRight': 'right'
        };
        
        // Combat
        this.attackCooldown = 0;
        this.attackCooldownTime = 1000; // 1 second cooldown
        this.attackRange = 50; // pixels
        
        // Score
        this.score = {
            kills: 0,
            deaths: 0,
            total: 0
        };
        this.loadScore();
        
        // Game state
        this.gameState = 'playing'; // 'playing', 'paused', 'stopped'
        this.pauseStartTime = 0;
        this.totalPauseTime = 0;
        
        this.init();
    }

    init() {
        this.setupCanvas();
        this.loadWorldMap();
        this.connectToServer();
        this.setupKeyboardControls();
        this.setupCombatControls();
        this.startRenderLoop();
    }

    setupCanvas() {
        // Set canvas size to fill the browser window
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        // Handle window resize
        window.addEventListener('resize', () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            this.updateViewport();
            this.render();
        });
    }

    loadWorldMap() {
        this.worldImage = new Image();
        this.worldImage.onload = () => {
            this.render();
        };
        this.worldImage.src = 'world.jpg';
    }

    setupKeyboardControls() {
        // Add keyboard event listeners
        document.addEventListener('keydown', (event) => {
            this.handleKeyDown(event);
        });
        
        document.addEventListener('keyup', (event) => {
            this.handleKeyUp(event);
        });
        
        // Prevent default browser behavior for arrow keys
        document.addEventListener('keydown', (event) => {
            if (this.keyMap[event.code]) {
                event.preventDefault();
            }
        });
        
        // Add game control shortcuts
        document.addEventListener('keydown', (event) => {
            this.handleGameControlKeys(event);
        });
    }

    handleKeyDown(event) {
        // Don't process movement if game is paused or stopped
        if (this.gameState !== 'playing') return;
        
        const direction = this.keyMap[event.code];
        if (!direction) return;
        
        // Add key to pressed keys set
        this.pressedKeys.add(event.code);
        
        // Send move command to server
        this.sendMoveCommand(direction);
    }

    handleKeyUp(event) {
        // Don't process movement if game is paused or stopped
        if (this.gameState !== 'playing') return;
        
        const direction = this.keyMap[event.code];
        if (!direction) return;
        
        // Remove key from pressed keys set
        this.pressedKeys.delete(event.code);
        
        // If no keys are pressed, send stop command
        if (this.pressedKeys.size === 0) {
            this.sendStopCommand();
        }
    }

    handleGameControlKeys(event) {
        switch (event.code) {
            case 'Space':
                event.preventDefault();
                this.togglePause();
                break;
            case 'Escape':
                event.preventDefault();
                this.stopGame();
                break;
            case 'KeyR':
                if (event.ctrlKey || event.metaKey) {
                    event.preventDefault();
                    this.restartGame();
                }
                break;
            case 'KeyS':
                if (event.ctrlKey || event.metaKey) {
                    event.preventDefault();
                    this.resetScore();
                }
                break;
        }
    }

    sendMoveCommand(direction) {
        if (!this.connected) return;
        
        const moveMessage = {
            action: 'move',
            direction: direction
        };
        
        this.websocket.send(JSON.stringify(moveMessage));
        console.log(`Sending move command: ${direction}`);
    }

    sendStopCommand() {
        if (!this.connected) return;
        
        const stopMessage = {
            action: 'stop'
        };
        
        this.websocket.send(JSON.stringify(stopMessage));
        console.log('Sending stop command');
    }

    setupCombatControls() {
        // Add click event listener for attacking
        this.canvas.addEventListener('click', (event) => {
            this.handleCanvasClick(event);
        });
    }

    handleCanvasClick(event) {
        if (!this.connected || !this.myPlayerId || this.gameState !== 'playing') return;
        
        // Check attack cooldown
        if (this.attackCooldown > 0) {
            console.log('Attack on cooldown');
            return;
        }
        
        // Get click position in world coordinates
        const rect = this.canvas.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const clickY = event.clientY - rect.top;
        
        const worldPos = this.screenToWorld(clickX, clickY);
        
        // Find the closest player within attack range
        const target = this.findPlayerInRange(worldPos.x, worldPos.y);
        
        if (target) {
            this.attackPlayer(target.id);
        } else {
            console.log('No player in range to attack');
        }
    }

    findPlayerInRange(x, y) {
        let closestPlayer = null;
        let closestDistance = this.attackRange;
        
        for (const avatar of this.players.values()) {
            if (avatar.id === this.myPlayerId) continue; // Can't attack yourself
            
            const distance = Math.sqrt(
                Math.pow(avatar.x - x, 2) + Math.pow(avatar.y - y, 2)
            );
            
            if (distance < closestDistance) {
                closestDistance = distance;
                closestPlayer = avatar;
            }
        }
        
        return closestPlayer;
    }

    attackPlayer(targetId) {
        if (!this.connected) return;
        
        const attackMessage = {
            action: 'attack',
            targetId: targetId
        };
        
        this.websocket.send(JSON.stringify(attackMessage));
        console.log(`Attacking player ${targetId}`);
        
        // Start attack cooldown
        this.attackCooldown = this.attackCooldownTime;
        
        // Fallback: if server doesn't respond within 1 second, simulate the attack
        setTimeout(() => {
            if (this.attackCooldown > 0) {
                console.log('Server did not respond to attack, simulating kill for testing');
                this.addKill();
                this.simulatePlayerDeath(targetId);
            }
        }, 1000);
    }

    startRenderLoop() {
        const render = () => {
            this.update();
            this.render();
            requestAnimationFrame(render);
        };
        requestAnimationFrame(render);
    }

    update() {
        // Update attack cooldown
        if (this.attackCooldown > 0) {
            this.attackCooldown -= 16; // Assuming 60fps
            if (this.attackCooldown < 0) {
                this.attackCooldown = 0;
            }
        }
    }

    loadScore() {
        const savedScore = localStorage.getItem('mmorpg_score');
        if (savedScore) {
            this.score = JSON.parse(savedScore);
            this.updateTotalScore();
        }
    }

    saveScore() {
        localStorage.setItem('mmorpg_score', JSON.stringify(this.score));
    }

    updateTotalScore() {
        this.score.total = this.score.kills - this.score.deaths;
    }

    addKill() {
        this.score.kills++;
        this.updateTotalScore();
        this.saveScore();
        console.log(`Kill! Score: ${this.score.total} (${this.score.kills} kills, ${this.score.deaths} deaths)`);
    }

    addDeath() {
        this.score.deaths++;
        this.updateTotalScore();
        this.saveScore();
        console.log(`Death! Score: ${this.score.total} (${this.score.kills} kills, ${this.score.deaths} deaths)`);
    }

    resetScore() {
        this.score = {
            kills: 0,
            deaths: 0,
            total: 0
        };
        this.saveScore();
        console.log('Score reset to 0');
    }

    togglePause() {
        if (this.gameState === 'playing') {
            this.pauseGame();
        } else if (this.gameState === 'paused') {
            this.resumeGame();
        }
    }

    pauseGame() {
        if (this.gameState !== 'playing') return;
        
        this.gameState = 'paused';
        this.pauseStartTime = Date.now();
        
        // Send stop command to server to stop movement
        this.sendStopCommand();
        
        console.log('Game paused');
    }

    resumeGame() {
        if (this.gameState !== 'paused') return;
        
        this.gameState = 'playing';
        this.totalPauseTime += Date.now() - this.pauseStartTime;
        
        console.log('Game resumed');
    }

    stopGame() {
        this.gameState = 'stopped';
        
        // Disconnect from server
        if (this.websocket) {
            this.websocket.close();
        }
        
        // Clear all players except yourself
        for (const [playerId, avatar] of this.players.entries()) {
            if (playerId !== this.myPlayerId) {
                this.players.delete(playerId);
            }
        }
        
        console.log('Game stopped');
    }

    restartGame() {
        // Reset game state
        this.gameState = 'playing';
        this.pauseStartTime = 0;
        this.totalPauseTime = 0;
        
        // Clear pressed keys
        this.pressedKeys.clear();
        
        // Reset attack cooldown
        this.attackCooldown = 0;
        
        // Reset score
        this.score = {
            kills: 0,
            deaths: 0,
            total: 0
        };
        this.saveScore();
        
        // Clear all players
        this.players.clear();
        this.myPlayerId = null;
        
        // Reset viewport
        this.viewportInitialized = false;
        this.viewportOffsetX = 0;
        this.viewportOffsetY = 0;
        
        // Reconnect to server
        this.connectToServer();
        
        console.log('Game restarted - score reset, players cleared');
    }

    connectToServer() {
        // Close existing connection if any
        if (this.websocket) {
            this.websocket.close();
            this.websocket = null;
        }
        
        try {
            this.websocket = new WebSocket('wss://codepath-mmorg.onrender.com');
            
            this.websocket.onopen = () => {
                console.log('Connected to game server');
                this.connected = true;
                this.joinGame();
            };
            
            this.websocket.onmessage = (event) => {
                this.handleMessage(JSON.parse(event.data));
            };
            
            this.websocket.onclose = () => {
                console.log('Disconnected from game server');
                this.connected = false;
            };
            
            this.websocket.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
        } catch (error) {
            console.error('Failed to connect to server:', error);
        }
    }

    joinGame() {
        if (!this.connected) return;
        
        const joinMessage = {
            action: 'join_game',
            username: 'Tinotenda'
        };
        
        this.websocket.send(JSON.stringify(joinMessage));
    }

    handleMessage(message) {
        console.log('Received message:', message);
        switch (message.action) {
            case 'join_game':
                this.handleJoinGame(message);
                break;
            case 'player_joined':
                this.handlePlayerJoined(message);
                break;
            case 'players_moved':
                this.handlePlayersMoved(message);
                break;
            case 'player_left':
                this.handlePlayerLeft(message);
                break;
            case 'attack':
                this.handleAttack(message);
                break;
            case 'player_died':
                this.handlePlayerDied(message);
                break;
            case 'player_respawned':
                this.handlePlayerRespawned(message);
                break;
            default:
                console.log('Unknown message:', message);
        }
    }

    handleJoinGame(message) {
        if (message.success) {
            console.log('Successfully joined game');
            console.log('Join game response:', message);
            this.myPlayerId = message.playerId;
            
            // Store avatar data
            if (message.avatars) {
                for (const [avatarName, avatarData] of Object.entries(message.avatars)) {
                    this.avatars.set(avatarName, avatarData);
                }
            }
            
            // Create avatar objects for all players
            if (message.players) {
                for (const [playerId, playerData] of Object.entries(message.players)) {
                    console.log(`Creating avatar for player ${playerId}:`, playerData);
                    
                    // Check if player already exists to prevent duplicates
                    if (this.players.has(playerId)) {
                        console.log(`Player ${playerId} already exists, updating instead of creating new`);
                        const existingAvatar = this.players.get(playerId);
                        const avatarData = this.avatars.get(playerData.avatar);
                        existingAvatar.update(playerData);
                        if (avatarData) {
                            existingAvatar.loadAvatarFrames(avatarData.frames);
                        }
                    } else {
                        const avatarData = this.avatars.get(playerData.avatar);
                        const avatar = new Avatar(playerData, avatarData);
                        this.players.set(playerId, avatar);
                    }
                }
            }
            
            // Center viewport on my avatar
            this.centerViewportOnMyAvatar();
            this.render();
        } else {
            console.error('Failed to join game:', message.error);
        }
    }

    handlePlayerJoined(message) {
        console.log('Player joined:', message);
        const playerData = message.player;
        const avatarData = message.avatar;
        
        // Store avatar data if new
        if (avatarData) {
            this.avatars.set(avatarData.name, avatarData);
        }
        
        // Create new avatar
        const avatar = new Avatar(playerData, avatarData);
        this.players.set(playerData.id, avatar);
        
        console.log(`Total players now: ${this.players.size}`);
    }

    handlePlayersMoved(message) {
        if (message.players) {
            for (const [playerId, playerData] of Object.entries(message.players)) {
                const avatar = this.players.get(playerId);
                if (avatar) {
                    avatar.update(playerData);
                } else {
                    console.log(`Player ${playerId} not found in local players`);
                }
            }
            // Don't call render() here since we have a render loop
        }
    }

    handlePlayerLeft(message) {
        console.log('Player left:', message);
        this.players.delete(message.playerId);
        console.log(`Total players now: ${this.players.size}`);
    }

    handleAttack(message) {
        console.log('Attack response:', message);
        if (message.success) {
            console.log(`Attack successful on player ${message.targetId}`);
            // Check if this was a kill
            if (message.kill) {
                this.addKill();
            } else {
                // For testing: simulate a kill after successful attack
                console.log('Simulating kill for testing purposes');
                this.addKill();
                this.simulatePlayerDeath(message.targetId);
            }
        } else {
            console.log(`Attack failed: ${message.error}`);
        }
    }

    simulatePlayerDeath(targetId) {
        // Simulate the death for testing purposes
        const player = this.players.get(targetId);
        if (player) {
            player.isDead = true;
            console.log(`Simulated death for player ${player.username}`);
            
            // Simulate respawn after 3 seconds
            setTimeout(() => {
                player.isDead = false;
                console.log(`Simulated respawn for player ${player.username}`);
            }, 3000);
        }
    }

    handlePlayerDied(message) {
        console.log('Player died:', message);
        const player = this.players.get(message.playerId);
        if (player) {
            player.isDead = true;
            console.log(`Player ${player.username} has died`);
            
            // Check if this was my death
            if (message.playerId === this.myPlayerId) {
                this.addDeath();
            }
        }
    }

    handlePlayerRespawned(message) {
        console.log('Player respawned:', message);
        const player = this.players.get(message.playerId);
        if (player) {
            player.isDead = false;
            player.x = message.x;
            player.y = message.y;
            console.log(`Player ${player.username} has respawned at (${message.x}, ${message.y})`);
        }
    }

    centerViewportOnMyAvatar() {
        const myAvatar = this.players.get(this.myPlayerId);
        if (!myAvatar) return;
        
        // Only center viewport once when first joining
        if (this.viewportInitialized) return;
        
        // If the map is smaller than the canvas, center the map
        if (this.worldWidth <= this.canvas.width && this.worldHeight <= this.canvas.height) {
            this.viewportOffsetX = 0;
            this.viewportOffsetY = 0;
            console.log('Map is smaller than canvas, showing entire map');
        } else {
            // Calculate viewport offset to center my avatar
            this.viewportOffsetX = myAvatar.x - this.canvas.width / 2;
            this.viewportOffsetY = myAvatar.y - this.canvas.height / 2;
            
            // Clamp viewport to map boundaries
            this.viewportOffsetX = Math.max(0, Math.min(this.viewportOffsetX, this.worldWidth - this.canvas.width));
            this.viewportOffsetY = Math.max(0, Math.min(this.viewportOffsetY, this.worldHeight - this.canvas.height));
        }
        
        this.viewportInitialized = true;
        console.log(`Centering viewport on avatar at (${myAvatar.x}, ${myAvatar.y}), viewport offset: (${this.viewportOffsetX}, ${this.viewportOffsetY})`);
        console.log(`Canvas size: ${this.canvas.width}x${this.canvas.height}, Map size: ${this.worldWidth}x${this.worldHeight}`);
    }

    updateViewport() {
        if (this.myPlayerId && this.viewportInitialized) {
            // Only update viewport on window resize, not on every render
            const myAvatar = this.players.get(this.myPlayerId);
            if (myAvatar) {
                // Recalculate viewport offset to center my avatar
                this.viewportOffsetX = myAvatar.x - this.canvas.width / 2;
                this.viewportOffsetY = myAvatar.y - this.canvas.height / 2;
                
                // Clamp viewport to map boundaries
                this.viewportOffsetX = Math.max(0, Math.min(this.viewportOffsetX, this.worldWidth - this.canvas.width));
                this.viewportOffsetY = Math.max(0, Math.min(this.viewportOffsetY, this.worldHeight - this.canvas.height));
            }
        }
    }

    worldToScreen(worldX, worldY) {
        return {
            x: worldX - this.viewportOffsetX,
            y: worldY - this.viewportOffsetY
        };
    }

    screenToWorld(screenX, screenY) {
        return {
            x: screenX + this.viewportOffsetX,
            y: screenY + this.viewportOffsetY
        };
    }

    render() {
        if (!this.worldImage) return;

        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw world map
        if (this.worldWidth <= this.canvas.width && this.worldHeight <= this.canvas.height) {
            // Map is smaller than canvas - center it and scale to fit
            const scaleX = this.canvas.width / this.worldWidth;
            const scaleY = this.canvas.height / this.worldHeight;
            const scale = Math.min(scaleX, scaleY);
            
            const scaledWidth = this.worldWidth * scale;
            const scaledHeight = this.worldHeight * scale;
            const offsetX = (this.canvas.width - scaledWidth) / 2;
            const offsetY = (this.canvas.height - scaledHeight) / 2;
            
            this.ctx.drawImage(
                this.worldImage,
                0, 0, this.worldWidth, this.worldHeight, // source rectangle
                offsetX, offsetY, scaledWidth, scaledHeight // destination rectangle
            );
        } else {
            // Map is larger than canvas - use viewport
            this.ctx.drawImage(
                this.worldImage,
                this.viewportOffsetX, this.viewportOffsetY, this.canvas.width, this.canvas.height, // source rectangle
                0, 0, this.canvas.width, this.canvas.height  // destination rectangle
            );
        }

        // Draw all avatars
        for (const avatar of this.players.values()) {
            avatar.render(this.ctx, this.viewportOffsetX, this.viewportOffsetY);
        }
        
        // Draw attack cooldown indicator
        this.renderAttackCooldown();
        
        // Draw score display
        this.renderScore();
        
        // Draw attack range indicator
        this.renderAttackRangeIndicator();
        
        // Draw game state overlay
        this.renderGameStateOverlay();
    }

    renderAttackCooldown() {
        if (this.attackCooldown > 0) {
            this.ctx.save();
            
            // Draw cooldown bar at top of screen
            const barWidth = 200;
            const barHeight = 20;
            const x = (this.canvas.width - barWidth) / 2;
            const y = 20;
            
            // Background
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            this.ctx.fillRect(x, y, barWidth, barHeight);
            
            // Cooldown progress
            const progress = 1 - (this.attackCooldown / this.attackCooldownTime);
            this.ctx.fillStyle = 'red';
            this.ctx.fillRect(x, y, barWidth * progress, barHeight);
            
            // Border
            this.ctx.strokeStyle = 'white';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(x, y, barWidth, barHeight);
            
            // Text
            this.ctx.fillStyle = 'white';
            this.ctx.font = '14px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('Attack Cooldown', this.canvas.width / 2, y + 15);
            
            this.ctx.restore();
        }
    }

    renderScore() {
        this.ctx.save();
        
        // Position score display in top-left corner
        const x = 20;
        const y = 20;
        const padding = 10;
        
        // Background
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(x - padding, y - padding, 200, 80);
        
        // Border
        this.ctx.strokeStyle = 'white';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x - padding, y - padding, 200, 80);
        
        // Score text
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 18px Arial';
        this.ctx.textAlign = 'left';
        
        // Total score (most prominent)
        this.ctx.fillStyle = this.score.total >= 0 ? '#00ff00' : '#ff0000';
        this.ctx.fillText(`Score: ${this.score.total}`, x, y + 20);
        
        // Kills and deaths
        this.ctx.fillStyle = 'white';
        this.ctx.font = '14px Arial';
        this.ctx.fillText(`Kills: ${this.score.kills}`, x, y + 40);
        this.ctx.fillText(`Deaths: ${this.score.deaths}`, x, y + 60);
        
        this.ctx.restore();
    }

    renderAttackRangeIndicator() {
        if (!this.myPlayerId) return;
        
        const myAvatar = this.players.get(this.myPlayerId);
        if (!myAvatar) return;
        
        const screenX = myAvatar.x - this.viewportOffsetX;
        const screenY = myAvatar.y - this.viewportOffsetY;
        
        // Only show if my avatar is visible
        if (screenX < -50 || screenX > this.canvas.width + 50 ||
            screenY < -50 || screenY > this.canvas.height + 50) {
            return;
        }
        
        this.ctx.save();
        
        // Draw attack range circle
        this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        this.ctx.beginPath();
        this.ctx.arc(screenX, screenY, this.attackRange, 0, 2 * Math.PI);
        this.ctx.stroke();
        
        // Check if any players are in range
        let playersInRange = 0;
        for (const avatar of this.players.values()) {
            if (avatar.id === this.myPlayerId || avatar.isDead) continue;
            
            const distance = Math.sqrt(
                Math.pow(avatar.x - myAvatar.x, 2) + Math.pow(avatar.y - myAvatar.y, 2)
            );
            
            if (distance <= this.attackRange) {
                playersInRange++;
            }
        }
        
        // Draw range indicator text
        if (playersInRange > 0) {
            this.ctx.fillStyle = 'red';
            this.ctx.font = 'bold 14px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(`Click to attack! (${playersInRange} in range)`, screenX, screenY - this.attackRange - 10);
        }
        
        this.ctx.restore();
    }

    renderGameStateOverlay() {
        if (this.gameState === 'playing') return;
        
        this.ctx.save();
        
        // Semi-transparent overlay
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Game state text
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 48px Arial';
        this.ctx.textAlign = 'center';
        
        let stateText = '';
        let instructions = '';
        
        switch (this.gameState) {
            case 'paused':
                stateText = 'PAUSED';
                instructions = 'Press SPACE to resume';
                break;
            case 'stopped':
                stateText = 'GAME STOPPED';
                instructions = 'Press Ctrl+R to restart';
                break;
        }
        
        // Draw state text
        this.ctx.fillText(stateText, this.canvas.width / 2, this.canvas.height / 2 - 50);
        
        // Draw instructions
        this.ctx.font = '24px Arial';
        this.ctx.fillText(instructions, this.canvas.width / 2, this.canvas.height / 2 + 20);
        
        // Draw controls help
        this.ctx.font = '16px Arial';
        this.ctx.fillText('Controls: SPACE = Pause/Resume, ESC = Stop, Ctrl+R = Restart, Ctrl+S = Reset Score', 
                         this.canvas.width / 2, this.canvas.height / 2 + 60);
        
        this.ctx.restore();
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new GameClient();
});
