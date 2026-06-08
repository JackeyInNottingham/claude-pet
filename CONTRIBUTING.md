# Contributing to Claude Pet

Thanks for your interest in contributing!

## Development Setup

```bash
git clone https://github.com/JackeyInNottingham/claude-pet.git
cd claude-pet/electron
npm install
```

## Running

```bash
# Start the pet
cd electron && npm start

# Run the demo (non-transparent window with all states)
cd electron && npm run demo
```

## Project Structure

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for architecture, state machine details, and animation system documentation.

See [CLAUDE.md](CLAUDE.md) for Claude Code working guidance in this repo.

## Pull Requests

- Keep changes focused and minimal
- Match the existing code style (no external dependencies unless absolutely necessary)
- Hook scripts must use only Node.js built-in modules — no npm packages
- Test on both Windows and macOS if possible
- End commit messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

## Reporting Issues

Include:
- OS and version
- Node.js version (`node -v`)
- Steps to reproduce
- Expected vs actual behavior
