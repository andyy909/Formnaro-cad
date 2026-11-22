# Contributing to Formnaro

## Reporting a problem

Include the exact Formnaro version and revision, the Windows version,
the workspace mode, and the steps that reproduce the problem. Describe
what you saw and what you expected. A small shareable example project or
screenshot can help. Use sample data and remove credentials and personal
information from attachments. [Open an issue](https://github.com/andyy909/Formnaro-cad/issues/new/choose)

## Preparing a change

1. Read the [repository instructions](AGENTS.md). Use the Node version
   in [.node-version](.node-version), then run `npm ci`.
2. Follow the [build guide](docs/BUILD.md) and run the tests that cover
   your change. `npm test` runs the standard tests and `npm run build`
   checks the application build.
3. In the pull request, describe the change, how you verified it, and
   any important test limits. For native runtime or packaging changes,
   review the [developer context](docs/ENTWICKLER-KONTEXT.md) and
   [portable packaging instructions](docs/PORTABLE-PAKETE.md).

For a documentation change, `node scripts/check-links.mjs` checks relative
links in the README files and the main documentation directory.

## Deutsch

Bei einer Fehlermeldung bitte Formnaro-Version mit Revision, Windows-Version,
Arbeitsmodus und reproduzierbare Schritte angeben. Ein kleines freigabefähiges
Beispielprojekt kann helfen. Hinweise zum Entwickeln und Prüfen stehen im
[Entwicklerkontext](docs/ENTWICKLER-KONTEXT.md).
