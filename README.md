# holler

Self-hosted Walkie-Talkie for Family and Friends

![Screenshot 2025-02-01 at 20-30-26 Holler](https://github.com/user-attachments/assets/78dfb134-716a-4605-aa4c-5c11a6ce5aad)

## 21 Prompts?

Holler was created in a matter of hours during a handful sessions
of using Github Copilot with Anthropic's Claude 3.5 Sonnet model.
You'll find every prompt used to get to this point in PROMPTS.md.

This is not production-ready software, it is a curiosity or a toy.

## Features

- 🔐 User authentication with registration and login
- 👥 Real-time participant presence
- 🎙️ Push-to-talk voice communication
- 🔇 Per-user muting
- 💬 Message history with catch-up playback
- 🎨 Unique color-coded avatars for each user
- 🔄 Automatic reconnection with exponential backoff
- 📱 Mobile-friendly interface
- 🔒 Secure password hashing and session management
- 🎛️ User settings (password change, logout)
- 🚦 Connection status indicators
- 💾 Persistent message storage using SQLite

## Local Development Setup

1. Install prerequisites:
   - Go 1.16 or later
   - Caddy web server (optional, for HTTPS)

2. Clone the repository:

   ```bash
   git clone https://github.com/21prompts/holler.git
   cd holler
   ```

3. Install Go dependencies:

   ```bash
   go mod tidy
   ```

4. Run the application:

   ```bash
   # Using the Procfile (if you have foreman/goreman installed)
   foreman start

   # Or run directly
   go run .
   ```

5. For HTTPS setup with Caddy:
   - Copy `Caddyfile.sample` to `Caddyfile`
   - Replace `hostname.your-tailnet.ts.net` with your domain
   - Run Caddy: `caddy run`

The app will be available at:

- HTTP: <http://localhost:8522>
- HTTPS (if using Caddy): <https://your-domain>

## Architecture

- Backend: Go with WebSocket support
- Frontend: Vanilla JavaScript
- Database: SQLite for persistent storage
- Audio: WebM/Opus codec for efficient voice transmission

## Security Notes

- Passwords are hashed using bcrypt
- Sessions are managed via secure cookies
- All WebSocket communications are binary for audio data
- HTTPS required for production use (setup via Caddy)
