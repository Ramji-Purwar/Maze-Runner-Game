# Maze Runner Game

A web-based maze runner game where you navigate through a randomly generated maze, collect powerups, and avoid enemies.

## How to Play

1. Open `index.html` in a web browser
2. Use arrow keys to move your character (red circle)
3. Reach the green circle (goal) to win
4. Avoid blue circles (enemies)
5. Collect powerups to help you escape:
   - Purple circles (Invisibility): Press A to activate and become invisible to enemies for 5 seconds
   - Orange circles (Teleport): Press S to teleport 15 steps toward the goal

## Features

- Randomly generated maze for each game
- Multiple enemies with different movement patterns
- Two types of powerups
- Mobile-friendly controls
- Responsive design

## Implementation Details

The game uses HTML5 Canvas for rendering and JavaScript for game logic. The maze is generated using a depth-first search algorithm with backtracking.

### Teleportation Algorithm

The teleport powerup uses a breadth-first search (BFS) with priority queue to find the optimal path toward the goal. It teleports the player 15 steps along this path, or to the goal if it's closer than 15 steps.

### Enemy AI

Enemies use different movement patterns:
- Hunt mode: Moves toward the player
- Patrol mode: Moves toward random target points
- Wander mode: Moves randomly

## Future Improvements

- Add levels with increasing difficulty
- Add a timer and score system
- Add more types of enemies and powerups
- Add sound effects and background music