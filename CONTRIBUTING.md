# Contributing

Thanks for taking an interest. Issues and pull requests are both welcome.

## Getting set up

Use Node 20 or 22 and install the dependencies.

```bash
npm install
npm run dev
```

`npm run dev` rebuilds `main.js` whenever a source file changes. Copy `main.js`,
`manifest.json` and `styles.css` into `.obsidian/plugins/bases-board/` in a test vault,
or symlink them so each rebuild lands there automatically.

## Before you open a pull request

```bash
npm run build
npm run lint
npm run coverage
npm run format:check
npm run knip
```

CI runs these checks on Node 20 and 22. New behavior should include a test. Commit
messages use [Conventional Commits](https://www.conventionalcommits.org).

Run the plugin in a real Obsidian vault when you change card rendering, drag and drop,
note creation or link behavior. Unit tests cannot reproduce every theme or every part of
the Obsidian lifecycle.
