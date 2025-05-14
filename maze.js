// Game constants
const CELL_SIZE = 25;
const ROWS = 20;
const COLS = 20;
const NUM_CATCHERS = 3;
const NUM_POWERUPS = 3;

// Colors
const WHITE = "#FFFFFF";
const BLACK = "#000000";
const RED = "#FF0000";
const GREEN = "#00FF00";
const BLUE = "#0000FF";
const YELLOW = "#FFFF00";
const PURPLE = "#A020F0";
const ORANGE = "#FFA500";

// Game state
let grid = [];
let player = null;
let goal = null;
let catchers = [];
let powerups = [];
let gameOver = false;
let invisibilityStartTime = 0;
let messageTimeout = null;

// References to HTML elements
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const invisibilityCountElement = document.getElementById('invisibility-count');
const teleportCountElement = document.getElementById('teleport-count');
const resetButton = document.getElementById('resetButton');

// Mobile controls
const upButton = document.getElementById('upButton');
const downButton = document.getElementById('downButton');
const leftButton = document.getElementById('leftButton');
const rightButton = document.getElementById('rightButton');
const aButton = document.getElementById('aButton');
const sButton = document.getElementById('sButton');

// Handle canvas resizing
function resizeCanvas() {
    // Get the display dimensions of the canvas
    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;
    
    // Check if the canvas needs to be resized
    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        // Set the canvas to the same size as its display size
        canvas.width = displayWidth;
        canvas.height = displayHeight;
    }
}

// Classes
class Cell {
    constructor(row, col) {
        this.row = row;
        this.col = col;
        this.walls = { top: true, right: true, bottom: true, left: true };
        this.visited = false;
    }

    draw() {
        const x = this.col * CELL_SIZE;
        const y = this.row * CELL_SIZE;

        ctx.strokeStyle = BLACK;
        ctx.lineWidth = 2;

        if (this.walls.top) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + CELL_SIZE, y);
            ctx.stroke();
        }
        if (this.walls.right) {
            ctx.beginPath();
            ctx.moveTo(x + CELL_SIZE, y);
            ctx.lineTo(x + CELL_SIZE, y + CELL_SIZE);
            ctx.stroke();
        }
        if (this.walls.bottom) {
            ctx.beginPath();
            ctx.moveTo(x, y + CELL_SIZE);
            ctx.lineTo(x + CELL_SIZE, y + CELL_SIZE);
            ctx.stroke();
        }
        if (this.walls.left) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x, y + CELL_SIZE);
            ctx.stroke();
        }
    }

    getNeighbors() {
        const neighbors = [];
        const directions = [
            ["top", -1, 0],
            ["right", 0, 1],
            ["bottom", 1, 0],
            ["left", 0, -1]
        ];

        for (const [direction, rowOffset, colOffset] of directions) {
            const newRow = this.row + rowOffset;
            const newCol = this.col + colOffset;

            if (0 <= newRow && newRow < ROWS && 0 <= newCol && newCol < COLS && !grid[newRow][newCol].visited) {
                neighbors.push({ direction, cell: grid[newRow][newCol] });
            }
        }

        return neighbors;
    }

    removeWall(other, direction) {
        const opposite = {
            "top": "bottom",
            "right": "left",
            "bottom": "top",
            "left": "right"
        };

        this.walls[direction] = false;
        other.walls[opposite[direction]] = false;
    }
}

class Player {
    constructor(row, col) {
        this.row = row;
        this.col = col;
        this.radius = CELL_SIZE / 3;
        this.invisibilityActive = false;
        this.collectedPowerups = {
            invisibility: 0,
            teleportation: 0
        };
        this.isTeleporting = false; // Flag to prevent multiple teleportation attempts
    }

    draw() {
        const x = this.col * CELL_SIZE + CELL_SIZE / 2;
        const y = this.row * CELL_SIZE + CELL_SIZE / 2;

        if (this.invisibilityActive) {
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = RED;
            ctx.beginPath();
            ctx.arc(x, y, this.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
        } else {
            ctx.fillStyle = RED;
            ctx.beginPath();
            ctx.arc(x, y, this.radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    move(direction) {
        let nextRow = this.row;
        let nextCol = this.col;

        if (direction === "up" && !grid[this.row][this.col].walls.top) {
            nextRow--;
        } else if (direction === "right" && !grid[this.row][this.col].walls.right) {
            nextCol++;
        } else if (direction === "down" && !grid[this.row][this.col].walls.bottom) {
            nextRow++;
        } else if (direction === "left" && !grid[this.row][this.col].walls.left) {
            nextCol--;
        }

        this.row = nextRow;
        this.col = nextCol;
    }

    // Improved teleportation that moves toward the goal
    useTeleportation() {
        // Prevent multiple teleportation attempts
        if (this.isTeleporting) {
            return false;
        }
        
        this.isTeleporting = true;
        
        // Try to teleport toward the goal (with timeout protection)
        let teleportSuccessful = this.teleportTowardGoal();
        
        this.isTeleporting = false;
        return teleportSuccessful;
    }
    
    // Teleport toward the goal using improved BFS with goal-directed heuristic
    teleportTowardGoal() {
        // Safety: Set timeout start time
        const startTime = Date.now();
        const MAX_PATHFINDING_TIME = 500; // 500ms max for pathfinding
        
        // Track visited positions
        const visited = new Set();
        visited.add(`${this.row},${this.col}`);
        
        // Calculate distance to goal
        const distanceToGoal = (r, c) => Math.abs(r - goal.row) + Math.abs(c - goal.col);
        const initialDistance = distanceToGoal(this.row, this.col);
        
        // Queue for BFS - use priority queue that favors paths moving toward the goal
        const queue = [{
            row: this.row,
            col: this.col,
            path: [], // Path from start to this point
            distance: initialDistance
        }];
        
        // BFS to find a path
        while (queue.length > 0) {
            // Safety: Check for timeout
            if (Date.now() - startTime > MAX_PATHFINDING_TIME) {
                console.log("Pathfinding timeout - falling back to simpler teleport");
                showMessage("Path search timed out - using backup teleport", 1500);
                return this.teleportForward(10); // Fall back to forward teleportation
            }
            
            // Sort queue to prioritize moves closer to goal
            queue.sort((a, b) => a.distance - b.distance);
            
            const current = queue.shift();
            
            // If we've reached the goal, or found a path with at least 15 steps
            if ((current.row === goal.row && current.col === goal.col) || 
                current.path.length >= 15) {
                
                // If we have at least one step in the path
                if (current.path.length > 0) {
                    // Move to the position at 15 steps (or last step if path is shorter)
                    const targetIndex = Math.min(14, current.path.length - 1);
                    const target = current.path[targetIndex];
                    
                    // Verify the target position is actually closer to the goal than our starting position
                    const targetDistance = distanceToGoal(target.row, target.col);
                    if (targetDistance >= initialDistance) {
                        console.log("Found path doesn't bring us closer to goal - using forward teleport");
                        return this.teleportForward(10);
                    }
                    
                    // Teleport to the target position
                    this.row = target.row;
                    this.col = target.col;
                    return true;
                }
                
                return false; // No steps in path
            }
            
            // Try each possible direction
            const directions = [
                { name: "up", rowOffset: -1, colOffset: 0 },
                { name: "right", rowOffset: 0, colOffset: 1 },
                { name: "down", rowOffset: 1, colOffset: 0 },
                { name: "left", rowOffset: 0, colOffset: -1 }
            ];
            
            for (const dir of directions) {
                // Check if we can move in this direction (no wall)
                let canMove = false;
                
                if (dir.name === "up" && !grid[current.row][current.col].walls.top) canMove = true;
                else if (dir.name === "right" && !grid[current.row][current.col].walls.right) canMove = true;
                else if (dir.name === "down" && !grid[current.row][current.col].walls.bottom) canMove = true;
                else if (dir.name === "left" && !grid[current.row][current.col].walls.left) canMove = true;
                
                if (canMove) {
                    const newRow = current.row + dir.rowOffset;
                    const newCol = current.col + dir.colOffset;
                    const posKey = `${newRow},${newCol}`;
                    
                    // Check if position is valid and not visited
                    if (
                        newRow >= 0 && newRow < ROWS &&
                        newCol >= 0 && newCol < COLS &&
                        !visited.has(posKey)
                    ) {
                        // Add position to visited set
                        visited.add(posKey);
                        
                        // Calculate the new distance to goal
                        const newDistance = distanceToGoal(newRow, newCol);
                        
                        // Create new path by copying current path and adding new position
                        const newPath = [...current.path, { row: newRow, col: newCol }];
                        
                        // Enqueue the new position with its path
                        queue.push({
                            row: newRow,
                            col: newCol,
                            path: newPath,
                            distance: newDistance
                        });
                    }
                }
            }
        }
        
        // If no path found, try simple teleport as fallback
        console.log("No path found to goal - using forward teleport");
        showMessage("No path found - using forward teleport", 1500);
        return this.teleportForward(10);
    }
    
    // New method that guarantees forward movement (away from start point, not always toward goal)
    teleportForward(steps) {
        // Store original position
        const originalRow = this.row;
        const originalCol = this.col;
        
        // Try to find a path away from the starting point (not necessarily toward goal)
        const distanceFromStart = (r, c) => Math.abs(r - originalRow) + Math.abs(c - originalCol);
        let bestRow = this.row;
        let bestCol = this.col;
        let bestDistance = 0;
        
        let movesMade = 0;
        let maxAttempts = 100; // Prevent infinite loop
        
        // Try to make the specified number of moves
        while (movesMade < steps && maxAttempts > 0) {
            maxAttempts--;
            
            // Get all possible directions
            const possibleDirections = [];
            
            if (!grid[this.row][this.col].walls.top) possibleDirections.push("up");
            if (!grid[this.row][this.col].walls.right) possibleDirections.push("right");
            if (!grid[this.row][this.col].walls.bottom) possibleDirections.push("down");
            if (!grid[this.row][this.col].walls.left) possibleDirections.push("left");
            
            // If no directions available, break
            if (possibleDirections.length === 0) {
                break;
            }
            
            // Choose a direction that maximizes distance from start
            let bestDirection = null;
            let bestNewDistance = distanceFromStart(this.row, this.col);
            
            for (const dir of possibleDirections) {
                let newRow = this.row;
                let newCol = this.col;
                
                if (dir === "up") newRow--;
                else if (dir === "right") newCol++;
                else if (dir === "down") newRow++;
                else if (dir === "left") newCol--;
                
                const newDistance = distanceFromStart(newRow, newCol);
                if (newDistance > bestNewDistance) {
                    bestNewDistance = newDistance;
                    bestDirection = dir;
                }
            }
            
            // If no improving direction, use a random one
            if (!bestDirection) {
                bestDirection = possibleDirections[Math.floor(Math.random() * possibleDirections.length)];
            }
            
            // Move in the chosen direction
            this.move(bestDirection);
            movesMade++;
            
            // Track best position reached
            const currentDistance = distanceFromStart(this.row, this.col);
            if (currentDistance > bestDistance) {
                bestDistance = currentDistance;
                bestRow = this.row;
                bestCol = this.col;
            }
            
            // Check if we've reached the goal
            if (this.row === goal.row && this.col === goal.col) {
                return true;
            }
        }
        
        // Go to the best position we found (furthest from start)
        if (bestDistance > 0) {
            this.row = bestRow;
            this.col = bestCol;
            return true;
        }
        
        // If we couldn't find a good path, revert to original position
        this.row = originalRow;
        this.col = originalCol;
        showMessage("Teleportation failed - no clear path forward!", 1500);
        return false;
    }
}

class PowerUp {
    constructor(row, col, type) {
        this.row = row;
        this.col = col;
        this.type = type; // "invisibility" or "teleportation"
        this.radius = CELL_SIZE / 4;
        this.collected = false;
    }

    draw() {
        if (!this.collected) {
            const x = this.col * CELL_SIZE + CELL_SIZE / 2;
            const y = this.row * CELL_SIZE + CELL_SIZE / 2;
            
            if (this.type === "invisibility") {
                // Purple circle with eye symbol
                ctx.fillStyle = PURPLE;
                ctx.beginPath();
                ctx.arc(x, y, this.radius, 0, Math.PI * 2);
                ctx.fill();
                
                // Eye symbol
                ctx.fillStyle = WHITE;
                ctx.beginPath();
                ctx.arc(x, y, this.radius / 2, 0, Math.PI * 2);
                ctx.fill();
                
                ctx.fillStyle = BLACK;
                ctx.beginPath();
                ctx.arc(x, y, this.radius / 4, 0, Math.PI * 2);
                ctx.fill();
            } else {
                // Orange circle with T symbol
                ctx.fillStyle = ORANGE;
                ctx.beginPath();
                ctx.arc(x, y, this.radius, 0, Math.PI * 2);
                ctx.fill();
                
                // T symbol
                ctx.fillStyle = BLACK;
                ctx.font = `${this.radius}px Arial`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText("T", x, y);
            }
        }
    }
}

class Catcher {
    constructor(row, col) {
        this.row = row;
        this.col = col;
        this.radius = CELL_SIZE / 3;
        this.moveCounter = 0;
        this.moveDelay = Math.floor(Math.random() * 9) + 10; // 10-18
        this.previousPositions = [];
        this.randomDirectionCounter = 0;
        this.pathFindingMode = ["hunt", "patrol", "wander"][Math.floor(Math.random() * 3)];
        this.patrolTarget = null;
        this.wanderSteps = 0;
    }

    draw() {
        const x = this.col * CELL_SIZE + CELL_SIZE / 2;
        const y = this.row * CELL_SIZE + CELL_SIZE / 2;
        
        ctx.fillStyle = BLUE;
        ctx.beginPath();
        ctx.arc(x, y, this.radius, 0, Math.PI * 2);
        ctx.fill();
    }

    move() {
        // Only move every few frames to slow down catchers
        this.moveCounter++;
        if (this.moveCounter < this.moveDelay) {
            return;
        }
        
        this.moveCounter = 0;
        
        // Possible directions the catcher can move
        const validDirections = [];
        
        // Check which directions are valid (no walls)
        if (!grid[this.row][this.col].walls.top) {
            validDirections.push(["up", -1, 0]);
        }
        if (!grid[this.row][this.col].walls.right) {
            validDirections.push(["right", 0, 1]);
        }
        if (!grid[this.row][this.col].walls.bottom) {
            validDirections.push(["down", 1, 0]);
        }
        if (!grid[this.row][this.col].walls.left) {
            validDirections.push(["left", 0, -1]);
        }
        
        if (validDirections.length === 0) {
            return;
        }
        
        // Increment the random direction counter - forces randomness every so often
        this.randomDirectionCounter++;
        
        // Every 10-15 moves, switch the movement mode to prevent getting stuck in patterns
        if (this.randomDirectionCounter >= Math.floor(Math.random() * 6) + 10) {
            this.randomDirectionCounter = 0;
            this.pathFindingMode = ["hunt", "patrol", "wander"][Math.floor(Math.random() * 3)];
            
            // If switching to patrol mode, pick a random target
            if (this.pathFindingMode === "patrol") {
                this.patrolTarget = {
                    row: Math.floor(Math.random() * ROWS),
                    col: Math.floor(Math.random() * COLS)
                };
            }
            
            // If switching to wander mode, decide how many steps to take
            if (this.pathFindingMode === "wander") {
                this.wanderSteps = Math.floor(Math.random() * 6) + 5; // 5-10
            }
        }
        
        // Filter out directions that would lead back to a recent position (prevent oscillation)
        let nonRepeatingDirections = [];
        
        for (const [direction, rowOffset, colOffset] of validDirections) {
            const newRow = this.row + rowOffset;
            const newCol = this.col + colOffset;
            
            // Only consider this direction if it hasn't been visited in the last 3 positions
            if (!this.previousPositions.some(pos => pos.row === newRow && pos.col === newCol)) {
                nonRepeatingDirections.push([direction, rowOffset, colOffset]);
            }
        }
        
        // If all directions would lead to recent positions but we have valid directions, 
        // allow any valid direction as a last resort
        if (nonRepeatingDirections.length === 0 && validDirections.length > 0) {
            nonRepeatingDirections = validDirections;
        }
        
        // Choose direction based on current mode
        let chosenDirection = null;
        
        if (this.pathFindingMode === "hunt" && Math.random() < 0.7) {
            // Hunt mode: Move toward player with high probability
            let bestDirection = null;
            let minDistance = Infinity;
            
            for (const [direction, rowOffset, colOffset] of nonRepeatingDirections) {
                const newRow = this.row + rowOffset;
                const newCol = this.col + colOffset;
                
                // Calculate Manhattan distance to player from this new position
                const distance = Math.abs(newRow - player.row) + Math.abs(newCol - player.col);
                
                if (distance < minDistance) {
                    minDistance = distance;
                    bestDirection = [direction, rowOffset, colOffset];
                }
            }
            
            if (bestDirection) {
                chosenDirection = bestDirection;
            }
        } else if (this.pathFindingMode === "patrol" && this.patrolTarget && Math.random() < 0.8) {
            // Patrol mode: Move toward random patrol target
            let bestDirection = null;
            let minDistance = Infinity;
            
            for (const [direction, rowOffset, colOffset] of nonRepeatingDirections) {
                const newRow = this.row + rowOffset;
                const newCol = this.col + colOffset;
                
                // Calculate Manhattan distance to patrol target
                const distance = Math.abs(newRow - this.patrolTarget.row) + Math.abs(newCol - this.patrolTarget.col);
                
                if (distance < minDistance) {
                    minDistance = distance;
                    bestDirection = [direction, rowOffset, colOffset];
                }
            }
            
            if (bestDirection) {
                chosenDirection = bestDirection;
            }
            
            // If we've reached the patrol target, pick a new one
            if (this.row === this.patrolTarget.row && this.col === this.patrolTarget.col) {
                this.patrolTarget = {
                    row: Math.floor(Math.random() * ROWS),
                    col: Math.floor(Math.random() * COLS)
                };
            }
        } else if (this.pathFindingMode === "wander" && this.wanderSteps > 0) {
            // Wander mode: Move randomly for a while
            chosenDirection = nonRepeatingDirections[Math.floor(Math.random() * nonRepeatingDirections.length)];
            this.wanderSteps--;
        }
        
        // If no direction was chosen by the modes, pick a random one
        if (!chosenDirection && nonRepeatingDirections.length > 0) {
            chosenDirection = nonRepeatingDirections[Math.floor(Math.random() * nonRepeatingDirections.length)];
        }
        
        // Apply movement
        if (chosenDirection) {
            const [_, rowOffset, colOffset] = chosenDirection;
            const newRow = this.row + rowOffset;
            const newCol = this.col + colOffset;
            
            // Update position
            this.row = newRow;
            this.col = newCol;
            
            // Store this position in history (limit to last 5 positions)
            this.previousPositions.push({row: this.row, col: this.col});
            if (this.previousPositions.length > 5) {
                this.previousPositions.shift();
            }
        }
    }
}

class Goal {
    constructor(row, col) {
        this.row = row;
        this.col = col;
    }

    draw() {
        const x = this.col * CELL_SIZE + CELL_SIZE / 2;
        const y = this.row * CELL_SIZE + CELL_SIZE / 2;
        
        ctx.fillStyle = GREEN;
        ctx.beginPath();
        ctx.arc(x, y, CELL_SIZE / 3, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Game functions
function createGrid() {
    grid = [];
    for (let row = 0; row < ROWS; row++) {
        grid[row] = [];
        for (let col = 0; col < COLS; col++) {
            grid[row][col] = new Cell(row, col);
        }
    }
}

function generateMaze() {
    const stack = [];
    const startCell = grid[0][0];
    startCell.visited = true;
    stack.push(startCell);
    
    while (stack.length > 0) {
        const currentCell = stack[stack.length - 1];
        const neighbors = currentCell.getNeighbors();
        
        if (neighbors.length === 0) {
            stack.pop();
            continue;
        }
        
        const randomIndex = Math.floor(Math.random() * neighbors.length);
        const { direction, cell: nextCell } = neighbors[randomIndex];
        
        currentCell.removeWall(nextCell, direction);
        nextCell.visited = true;
        stack.push(nextCell);
    }
}

function createCatchers() {
    catchers = [];
    const validPositions = [];
    
    // Find all valid positions (not walls, not player start, not goal)
    for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
            if (!(row === 0 && col === 0) && !(row === ROWS - 1 && col === COLS - 1)) {
                validPositions.push({row, col});
            }
        }
    }
    
    // Randomly choose positions for catchers
    if (validPositions.length >= NUM_CATCHERS) {
        for (let i = 0; i < NUM_CATCHERS; i++) {
            const randomIndex = Math.floor(Math.random() * validPositions.length);
            const position = validPositions.splice(randomIndex, 1)[0];
            catchers.push(new Catcher(position.row, position.col));
        }
    }
}

function createPowerups() {
    powerups = [];
    const validPositions = [];
    
    // Find all valid positions (not occupied by player, goal, or catchers)
    for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
            // Check if position is not occupied
            let isOccupied = (row === player.row && col === player.col) || 
                             (row === goal.row && col === goal.col);
            
            for (const catcher of catchers) {
                if (row === catcher.row && col === catcher.col) {
                    isOccupied = true;
                    break;
                }
            }
            
            if (!isOccupied) {
                validPositions.push({row, col});
            }
        }
    }
    
    // Randomly choose positions for powerups
    if (validPositions.length >= NUM_POWERUPS * 2) {
        // Invisibility power-ups
        for (let i = 0; i < NUM_POWERUPS; i++) {
            const randomIndex = Math.floor(Math.random() * validPositions.length);
            const position = validPositions.splice(randomIndex, 1)[0];
            powerups.push(new PowerUp(position.row, position.col, "invisibility"));
        }
        
        // Teleportation power-ups
        for (let i = 0; i < NUM_POWERUPS; i++) {
            const randomIndex = Math.floor(Math.random() * validPositions.length);
            const position = validPositions.splice(randomIndex, 1)[0];
            powerups.push(new PowerUp(position.row, position.col, "teleportation"));
        }
    }
}

function checkCollision() {
    // If player is invisible, no collision occurs
    if (player.invisibilityActive) {
        return false;
    }
    
    for (const catcher of catchers) {
        if (player.row === catcher.row && player.col === catcher.col) {
            return true;
        }
    }
    return false;
}

function checkPowerupCollection() {
    for (const powerup of powerups) {
        if (!powerup.collected && player.row === powerup.row && player.col === powerup.col) {
            powerup.collected = true;
            // Increment the collected power-up counter
            player.collectedPowerups[powerup.type]++;
            console.log(`Collected ${powerup.type} power-up!`);
            updatePowerupDisplay();
            
            // Show temporary message
            showMessage(`Collected ${powerup.type} power-up!`);
        }
    }
}

function updatePowerupDisplay() {
    invisibilityCountElement.textContent = `Invisibility: ${player.collectedPowerups.invisibility} (A key)`;
    teleportCountElement.textContent = `Teleport: ${player.collectedPowerups.teleportation} (S key)`;
}

function showMessage(message, duration = 2000) {
    // Clear any existing timeout
    if (messageTimeout) {
        clearTimeout(messageTimeout);
    }
    
    // Add message to canvas
    const messageElement = document.createElement('div');
    messageElement.id = 'game-message';
    messageElement.style.position = 'absolute';
    messageElement.style.top = '50%';
    messageElement.style.left = '50%';
    messageElement.style.transform = 'translate(-50%, -50%)';
    messageElement.style.background = 'rgba(0, 0, 0, 0.7)';
    messageElement.style.color = 'white';
    messageElement.style.padding = '10px 20px';
    messageElement.style.borderRadius = '5px';
    messageElement.style.zIndex = '1000';
    messageElement.textContent = message;
    
    // Remove any existing message
    const existingMessage = document.getElementById('game-message');
    if (existingMessage) {
        existingMessage.remove();
    }
    
    document.body.appendChild(messageElement);
    
    // Set timeout to remove message
    messageTimeout = setTimeout(() => {
        if (document.getElementById('game-message')) {
            document.getElementById('game-message').remove();
        }
    }, duration);
}

function displayGameOver() {
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = YELLOW;
    ctx.font = "30px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("CAUGHT!", canvas.width / 2, canvas.height / 2 - 20);
    ctx.fillText("Press R to restart", canvas.width / 2, canvas.height / 2 + 20);
}

function draw() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Calculate the size of the maze in pixels
    const mazeWidth = COLS * CELL_SIZE;
    const mazeHeight = ROWS * CELL_SIZE;
    
    // Calculate the scale to fit the maze in the canvas
    const scaleX = canvas.width / mazeWidth;
    const scaleY = canvas.height / mazeHeight;
    const scale = Math.min(scaleX, scaleY) * 0.9; // 10% margin
    
    // Calculate the offset to center the maze
    const offsetX = (canvas.width - (mazeWidth * scale)) / 2;
    const offsetY = (canvas.height - (mazeHeight * scale)) / 2;
    
    // Save the current context state
    ctx.save();
    
    // Apply transformations
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
    
    // Draw cells (maze walls)
    for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
            grid[row][col].draw();
        }
    }
    
    // Draw powerups
    for (const powerup of powerups) {
        powerup.draw();
    }
    
    // Draw goal
    goal.draw();
    
    // Draw catchers
    for (const catcher of catchers) {
        catcher.draw();
    }
    
    // Draw player
    player.draw();
    
    // Restore the context state
    ctx.restore();
    
    // Draw game over screen if needed
    if (gameOver) {
        displayGameOver();
    }
}

function resetGame() {
    // Create grid and generate maze
    createGrid();
    generateMaze();
    
    // Create player and goal
    player = new Player(0, 0);
    goal = new Goal(ROWS - 1, COLS - 1);
    
    // Create catchers and powerups
    createCatchers();
    createPowerups();
    
    // Reset game state
    gameOver = false;
    updatePowerupDisplay();
}

function gameLoop() {
    // Handle canvas resizing
    resizeCanvas();
    
    // Update game state if not game over
    if (!gameOver) {
        // Move catchers
        for (const catcher of catchers) {
            catcher.move();
        }
        
        // Check if player has been caught
        if (checkCollision()) {
            gameOver = true;
            showMessage("CAUGHT! Press R to restart", 5000);
        }
        
        // Check if player has collected any powerups
        checkPowerupCollection();
        
        // Check if player reached the goal
        if (player.row === goal.row && player.col === goal.col) {
            console.log("Congratulations! You reached the goal!");
            showMessage("CONGRATULATIONS! You reached the goal!", 2000);
            setTimeout(resetGame, 2000);
        }
        
        // Check if invisibility should expire
        if (player.invisibilityActive && Date.now() - invisibilityStartTime >= 5000) {
            player.invisibilityActive = false;
            showMessage("Invisibility expired!", 1000);
        }
    }
    
    // Draw everything
    draw();
    
    // Continue the game loop
    requestAnimationFrame(gameLoop);
}

// Event listeners
document.addEventListener('keydown', (event) => {
    // Prevent default behavior for arrow keys to avoid page scrolling
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault();
    }
    
    if (!gameOver) {
        // Movement
        if (event.key === 'ArrowUp') {
            player.move("up");
        } else if (event.key === 'ArrowRight') {
            player.move("right");
        } else if (event.key === 'ArrowDown') {
            player.move("down");
        } else if (event.key === 'ArrowLeft') {
            player.move("left");
        }
        // Power-ups
        else if (event.key === 'a' && player.collectedPowerups.invisibility > 0) {
            // Activate invisibility
            player.invisibilityActive = true;
            player.collectedPowerups.invisibility--;
            invisibilityStartTime = Date.now();
            updatePowerupDisplay();
            showMessage("Invisibility activated!", 1000);
        } 
        // Teleport power-up (with safety measures)
        else if (event.key === 's' && player.collectedPowerups.teleportation > 0) {
            // Only process if not already teleporting to prevent multiple attempts
            if (!player.isTeleporting) {
                try {
                    if (player.useTeleportation()) {
                        player.collectedPowerups.teleportation--;
                        updatePowerupDisplay();
                        showMessage("Teleported!", 1000);
                    }
                } catch (error) {
                    console.error("Teleportation error:", error);
                    showMessage("Teleportation failed!", 1000);
                    player.isTeleporting = false;
                }
            }
        }
    }
    
    // Reset game
    if (event.key === 'r') {
        resetGame();
    }
});

// Mobile control buttons
upButton.addEventListener('click', () => {
    if (!gameOver) player.move("up");
});

downButton.addEventListener('click', () => {
    if (!gameOver) player.move("down");
});

leftButton.addEventListener('click', () => {
    if (!gameOver) player.move("left");
});

rightButton.addEventListener('click', () => {
    if (!gameOver) player.move("right");
});

aButton.addEventListener('click', () => {
    if (!gameOver && player.collectedPowerups.invisibility > 0) {
        player.invisibilityActive = true;
        player.collectedPowerups.invisibility--;
        invisibilityStartTime = Date.now();
        updatePowerupDisplay();
        showMessage("Invisibility activated!", 1000);
    }
});

sButton.addEventListener('click', () => {
    if (!gameOver && player.collectedPowerups.teleportation > 0 && !player.isTeleporting) {
        try {
            if (player.useTeleportation()) {
                player.collectedPowerups.teleportation--;
                updatePowerupDisplay();
                showMessage("Teleported!", 1000);
            }
        } catch (error) {
            console.error("Teleportation error:", error);
            showMessage("Teleportation failed!", 1000);
            player.isTeleporting = false;
        }
    }
});

resetButton.addEventListener('click', resetGame);

// Handle window resizing
window.addEventListener('resize', () => {
    resizeCanvas();
    // Force redraw after resize
    draw();
});

let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;
let touchEndY = 0;

// Set minimum swipe distance (in pixels) to register as a swipe
const MIN_SWIPE_DISTANCE = 30;

// Add touch event listeners to the canvas
canvas.addEventListener('touchstart', function(e) {
    e.preventDefault(); // Prevent scrolling when touching the canvas
    
    // Get the initial touch position
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
}, false);

canvas.addEventListener('touchmove', function(e) {
    e.preventDefault(); // Prevent scrolling when touching the canvas
}, false);

canvas.addEventListener('touchend', function(e) {
    e.preventDefault(); // Prevent scrolling when touching the canvas
    
    // Get the final touch position
    touchEndX = e.changedTouches[0].clientX;
    touchEndY = e.changedTouches[0].clientY;
    
    // Calculate the swipe distance
    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;
    
    // Only process if not game over
    if (!gameOver) {
        // Check if the swipe was long enough to be intentional
        if (Math.abs(deltaX) > MIN_SWIPE_DISTANCE || Math.abs(deltaY) > MIN_SWIPE_DISTANCE) {
            // Determine the primary direction of the swipe
            if (Math.abs(deltaX) > Math.abs(deltaY)) {
                // Horizontal swipe
                if (deltaX > 0) {
                    // Right swipe
                    player.move("right");
                } else {
                    // Left swipe
                    player.move("left");
                }
            } else {
                // Vertical swipe
                if (deltaY > 0) {
                    // Down swipe
                    player.move("down");
                } else {
                    // Up swipe
                    player.move("up");
                }
            }
        }
    }
}, false);

// Add double tap for using powerups
let lastTap = 0;
canvas.addEventListener('touchend', function(e) {
    // Check for double tap (for activating powerups)
    const currentTime = new Date().getTime();
    const tapLength = currentTime - lastTap;
    
    if (tapLength < 500 && tapLength > 0) {
        // Double tap detected
        
        // Get the tap position to determine which half of the screen was tapped
        const tapX = e.changedTouches[0].clientX;
        const canvasCenterX = canvas.clientWidth / 2;
        
        if (!gameOver) {
            if (tapX < canvasCenterX) {
                // Left side double tap - activate invisibility
                if (player.collectedPowerups.invisibility > 0) {
                    player.invisibilityActive = true;
                    player.collectedPowerups.invisibility--;
                    invisibilityStartTime = Date.now();
                    updatePowerupDisplay();
                    showMessage("Invisibility activated!", 1000);
                }
            } else {
                // Right side double tap - activate teleport
                if (player.collectedPowerups.teleportation > 0 && !player.isTeleporting) {
                    try {
                        if (player.useTeleportation()) {
                            player.collectedPowerups.teleportation--;
                            updatePowerupDisplay();
                            showMessage("Teleported!", 1000);
                        }
                    } catch (error) {
                        console.error("Teleportation error:", error);
                        showMessage("Teleportation failed!", 1000);
                        player.isTeleporting = false;
                    }
                }
            }
        }
    }
    
    lastTap = currentTime;
});

// Initialize the game
resetGame();
gameLoop();

