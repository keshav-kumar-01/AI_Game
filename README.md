# ⚔ Shadow Fight — Web RL Fighting Game

A complete browser-based 2D fighting game built with pure HTML5 Canvas and ES modules, featuring **Shadow Fight-style silhouette fighters with glowing edge effects** and a **Reinforcement Learning (RL) AI opponent** that learns as you play.

---

## 🚀 How to Run and Play

Because the game uses standard JavaScript ES modules (`import`/`export`), it needs to be served via a local web server (or opened in an IDE with Live Server).

### Option 1: Using Node.js (Built-in)
Run the following in `c:\Game`:
```bash
npx serve .
# or
npx http-server . -p 8080
```
Then open `http://localhost:8080` (or the port shown) in your browser.

### Option 2: Using Python
```bash
python -m http.server 8080
```
Open `http://localhost:8080` in your browser.

---

## 🎮 Controls

| Action | Primary Keys | Alternate Keys |
|---|---|---|
| **Move Left / Right** | `←` / `→` | `A` / `D` |
| **Jump** | `↑` | `W` |
| **Crouch** | `↓` | `S` |
| **Punch (Jab)** | `J` | `Z` |
| **Kick (Front Kick)** | `K` | `X` |
| **Block** | `L` | `C` |
| **Special Attack** | `I` | `V` (Requires full meter) |
| **Uppercut** | `↑` + Punch | `W` + `J` |
| **Roundhouse Kick** | `↑` + Kick | `W` + `K` |
| **Low Crouch Punch** | `↓` + Punch | `S` + `J` |
| **Low Sweep Kick** | `↓` + Kick | `S` + `K` |
| **Select / Confirm** | `Enter` / `Space` / Mouse Click | `J` |
| **Pause** | `Esc` | — |
| **Toggle RL AI Stats** | `Tab` | — |
| **Debug Hitboxes** | `` ` `` (Tilde) | — |

---

## 📁 Modular Code Structure

Every system is completely decoupled into its own dedicated file:

```
c:\Game\
├── index.html              # Web entry point and responsive canvas container
├── package.json            # Node / module configuration
├── README.md               # Game overview & instructions
├── css/
│   └── style.css           # Dark atmospheric Shadow Fight styling & glow themes
└── js/
    ├── main.js             # Bootstrapper that initializes the engine on DOM ready
    ├── engine.js           # Core GameEngine: fixed 60Hz loop, match/round FSM, hit-lag
    ├── ai.js               # RL Agent: Q-learning, discretized state space, reward shaping, persistence
    ├── fighter.js          # Fighter entity: state machine, move frame data, hurtbox/hitbox
    ├── animation.js        # Procedural skeletal animation system with 16 fighting move clips
    ├── physics.js          # Physics engine: push collisions, stage bounds, hit detection
    ├── renderer.js         # 3-layer shadow silhouette renderer with glowing edges & particle FX
    ├── input.js            # InputManager: keyboard listeners, action mapping, input buffer
    ├── ui.js               # UI/HUD: smooth health bars, special meter, announcements, menus, RL stats
    └── utils.js            # Vector2 math, AABB collision, easing curves, color utilities, constants
```

---

## 🧠 How the Reinforcement Learning AI Works (`js/ai.js`)

1. **State Space Discretization**:
   - Horizontal distance to opponent (`distanceX` in 5 bins)
   - Vertical elevation difference (`distanceY` in 3 bins)
   - AI health & Player health (`ownHealth`, `opponentHealth` in 4 bins each)
   - AI state & Player state (neutral, attacking, blocking, stunned, airborne, crouching)
   - Grounded & special meter status
2. **Action Space (13 Actions)**:
   - Idle, Move Forward, Move Backward, Jump, Crouch, Punch, Kick, Block, Special, Uppercut, Roundhouse, Crouch Punch, Crouch Kick.
3. **Reward Structure**:
   - `+Damage`: Scaled positive reward for connecting attacks.
   - `-Damage`: Scaled negative reward when hit.
   - `+Block`: Reward for defending against player aggression.
   - `-Whiff`: Small penalty for swinging into empty air.
   - `+Approach`: Small incentive to close distance when far away.
   - `+Win / -Loss`: Terminal rewards for winning/losing rounds.
4. **Q-Learning Update**:
   $$Q(s, a) \leftarrow Q(s, a) + \alpha \left[ r + \gamma \max_{a'} Q(s', a') - Q(s, a) \right]$$
5. **Persistence**:
   - The learned Q-table is automatically saved to `localStorage`, so the AI remembers past matches and gets smarter over time.
   - Can be reset at any time via the main menu's **RESET AI** option.
