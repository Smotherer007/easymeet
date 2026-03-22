# Contributing to EasyMeet

Thank you for your interest in contributing to EasyMeet!

## How to Contribute

### Reporting Bugs

- Use the [Issues](https://github.com/Smotherer007/easymeet/issues) tab.
- Include steps to reproduce, expected vs. actual behavior, and your environment (browser, OS).

### Suggesting Features

- Open an issue with the `enhancement` label.
- Describe the use case and how it would improve EasyMeet.

### Pull Requests

1. Fork the repository.
2. Create a branch: `git checkout -b feature/your-feature` or `fix/your-fix`.
3. Make your changes. Follow the existing code style.
4. Run `npm run build` to ensure the project builds. Optionally `npm run pretty:check`.
5. Commit with a clear message: `git commit -m "Add: short description"`.
6. Push and open a Pull Request against `main`.

### Code Style

- Vanilla JS, ES modules.
- JSDoc comments in English.
- Keep functions focused (≤20 lines where practical).

### Development Setup

Monorepo: **`client/`** (Vite-Frontend), **`server/`** mit **`server/src/`** (API + mediasoup). Im **Repository-Root**:

```bash
npm install
npm run dev:all
```

Konfiguration: **`.env`** im Repo-Root aus **`.env.example`**; optional **`server/.env`** überschreibt einzelne Variablen. Formatierung: `npm run pretty`.

See [README.md](README.md) for full documentation.
