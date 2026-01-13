# Contributing to ParaApp

Thanks for your interest in contributing to ParaApp! This document provides guidelines for contributing.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/mrv777/ParaApp.git`
3. Install dependencies: `pnpm install`
4. Start the dev server: `pnpm start`

## Development Setup

### Prerequisites

- Node.js 18+
- pnpm
- iOS Simulator (macOS) or Android Emulator
- For physical device testing: development build via EAS

### Running the App

```bash
pnpm start           # Start Expo dev server
pnpm start --android # Launch on Android
pnpm start --ios     # Launch on iOS
```

### Code Quality

Before submitting a PR, ensure:

```bash
pnpm lint        # No ESLint errors
pnpm typecheck   # No TypeScript errors
```

## Code Style

- **TypeScript**: Strict mode enabled
- **Components**: Functional components with hooks
- **Styling**: NativeWind (Tailwind CSS classes)
- **State**: Zustand stores for global state
- **Formatting**: Prettier (runs automatically)

### Naming Conventions

- Components: `PascalCase` (e.g., `MinerRow.tsx`)
- Hooks: `camelCase` with `use` prefix (e.g., `usePolling.ts`)
- Utilities: `camelCase` (e.g., `formatting.ts`)
- Types: `PascalCase` (e.g., `MinerInfo`)

## Pull Request Process

1. Create a feature branch: `git checkout -b feat/your-feature`
2. Make your changes
3. Run `pnpm lint && pnpm typecheck`
4. Commit using [conventional commits](https://www.conventionalcommits.org/):
   - `feat:` New feature
   - `fix:` Bug fix
   - `chore:` Maintenance
   - `docs:` Documentation
5. Push and open a PR against `main`

### PR Guidelines

- Keep PRs focused on a single change
- Include a clear description of what and why
- Add screenshots for UI changes
- Update documentation if needed

## Project Structure

```
src/
  screens/      # Screen components
  components/   # Reusable UI components
  store/        # Zustand state stores
  api/          # API clients
  hooks/        # Custom React hooks
  utils/        # Utility functions
  types/        # TypeScript types
  i18n/         # Translations
  constants/    # Theme, colors, config
server/         # Cloudflare Workers notification server
```

## Translation Contributions

We welcome translations! Language files are in `src/i18n/locales/`.

1. Copy `en.ts` to your language code (e.g., `ja.ts`)
2. Translate all strings
3. Add the language to `src/i18n/index.ts`

## Questions?

Open a [GitHub Issue](https://github.com/mrv777/ParaApp/issues) or start a [Discussion](https://github.com/mrv777/ParaApp/discussions).

## License

By contributing, you agree that your contributions will be licensed under the GPL-3.0 License.
