# Claude Plugin Omniroute

A collection of utility scripts, web interfaces, and local development tools created for Claude Code and OmniRoute.

## Projects

### 🌐 Claude Code Web Studio (`server.js`)
A modern, responsive web interface for running and monitoring **Claude Code** and **OmniRoute** outside the terminal.

**Features:**
- **Zero Dependencies**: Pure Node.js HTTP server + Server-Sent Events (SSE).
- **Streaming Output**: Real-time response streaming, thought accordion, and token counters.
- **Visual Tool Cards**: Collapsible cards for `Bash`, `PowerShell`, `Read`, `Write`, and visual colorized `Edit` diffs.
- **Workspace File Explorer**: Interactive file tree with built-in modal syntax viewer.
- **Session Management**: Resume, switch, and manage multi-turn sessions with full context memory.
- **OmniRoute Integration**: Live status monitor for local OmniRoute router (`:20128`).
- **Dark & Light Themes**: Sleek Linear/Cursor-inspired design with keyboard shortcuts.

**Usage:**
```bash
node server.js
```
Then open [http://localhost:3000](http://localhost:3000) in your web browser.

### 🎮 Tic Tac Toe (`tictactoe.html`)
A fully functional, browser-based Tic Tac Toe game with a beautiful UI.

**Features:**
- Play against a friend (X goes first)
- Mobile-responsive design
- Smooth animations and transitions
- Win and tie detection
- Easy reset functionality

**Usage:** Open `tictactoe.html` in any web browser.

### 📅 today.js
A simple script that prints today's date and a PowerShell tip.

**Usage:** `node today.js`

## Getting Started

1. Clone or download this repository
2. Run `node server.js` to launch the Web GUI
3. Open `http://localhost:3000` in your browser
4. Enjoy!

## Technologies Used

- HTML5, CSS3, JavaScript
- Node.js (for today.js)

## License

This project was created with Claude Code.

---

Auto-generated from Claude Code sessions.