# Bases Board

An interactive board view for Obsidian Bases. Visualize your notes as a Kanban or Gallery, with grouping for columns and rows, drag-and-drop, and deep customization per base.

## Features

### Board layout

- **Kanban** — group notes into columns by a property value
- **Gallery** — display notes as a grid without column grouping
- **Sub-groups** — add a second grouping axis to create rows within each column
- **Drag-and-drop** — move cards between columns and rows; property values update automatically

### Card appearance

- **Card size** — small / medium / large
- **Image property** — show a thumbnail from a property value at the top of the card
- **Icon property** — show an icon next to the card title
- **Icon mapping** — map property values to Lucide icon names (`value=icon-name` format), independent of the stored value; falls back to the raw value when no mapping is set
- **ID property** — show a muted badge above the card title; left-click copies the value to clipboard, right-click opens an edit dialog
- **Side view** — open notes in a side pane instead of the main pane

### Columns and rows

- **Color** — apply a color to a column or row header, cells, or cards
- **Move** — reorder columns and rows with arrow buttons
- **Hide** — hide specific columns or rows from the board
- **Empty columns** — when `hideEmptyGroups` is off, columns in `groupOrder` are shown even if empty; other empty columns follow vault values

### Custom labels

- **Rename** — set a display name for any column or row without changing the underlying property value
- **Label mappings** — configure `groupLabels` / `subGroupLabels` options using `value=Label` format (multitext property)
- Drag-and-drop uses the original property values; labels are display-only

### New note

- **Folder** — specify where new notes are created (per base)
- **Template** — apply a template file; supports Templater if the plugin is installed, otherwise copies file content
- **Open after creation** — optionally open the new note immediately (default: off)
- Group and sub-group property values are assigned automatically to new notes

### Integrations

- **Supercharged Links** — applies `data-link-*` attributes from note frontmatter to link pills inside card properties, enabling Supercharged Links styling; hooks `_watchContainerDynamic` for dynamic updates in directly-opened bases

## Configuration

All options are configured directly in the Bases view config panel (per base). Plugin-level settings (column colors, appearance defaults) are saved in plugin settings.

### Browse icons command

Use **Bases Board: Browse icons** to open a searchable grid of all registered Lucide icons. Click any icon to copy its name to the clipboard — useful when setting up icon mapping.

## Installation

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](../../releases/latest).
2. Copy the files to `<Vault>/.obsidian/plugins/bases-board/`.
3. Enable the plugin in **Settings → Community plugins**.

### BRAT (for beta testing)

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat).
2. Add this repository via **BRAT → Add Beta Plugin**.

## Development

```bash
npm install       # install dependencies
npm run dev       # watch mode — rebuilds on save
npm run build     # production build + type check
npm run lint      # ESLint
npm run format    # Prettier
npm test          # Vitest
```

See [CLAUDE.md](CLAUDE.md) for the full release process.
