# Bases Board

[![Available in Obsidian](https://img.shields.io/badge/Available%20in%20Obsidian-7C3AED?logo=obsidian&logoColor=white&style=flat-square)](https://obsidian.md/plugins?id=bases-board)
[![Release](https://github.com/flowing-abyss/obsidian-bases-board/actions/workflows/release.yml/badge.svg)](https://github.com/flowing-abyss/obsidian-bases-board/actions/workflows/release.yml)
[![Downloads](https://img.shields.io/github/downloads/flowing-abyss/obsidian-bases-board/total?style=flat-square&label=downloads&color=blue)](https://github.com/flowing-abyss/obsidian-bases-board/releases)

Bases Board adds Kanban and gallery views to Obsidian Bases. It groups notes into
columns and rows, updates their properties when you move a card, and keeps layout and
appearance options with each base.

## Board layouts

- Build a Kanban board by grouping notes into columns with a property.
- Use gallery mode when you want a grid without column grouping.
- Add a second property to split each column into rows.
- Drag cards between columns and rows to update both properties.

## Cards

- Choose a small, medium or large card size.
- Show an image from a note property at the top of each card.
- Put a Lucide icon next to the title. Icon mappings use the `value=icon-name` format
  and do not change the stored value.
- Show an ID above the title. Click it to copy the value or right-click it to edit the
  property.
- Click a title to open its note in a new tab. The rest of the card remains available
  for dragging.

## Columns and rows

- Apply colors to headers, cells or cards.
- Reorder columns and rows from their menus.
- Hide values that do not belong on a board.
- Keep configured columns visible when they have no cards by turning off
  `hideEmptyGroups` and listing them in `groupOrder`.
- Give a column or row a display label without changing its property value. Label
  mappings use the `value=Label` format in `groupLabels` and `subGroupLabels`.

Drag and drop always writes the original property value, not its display label.

## New notes

Each base can choose a folder and a template for new notes. The board assigns the
current column and row values after creation. It can also open the note when it is
ready.

Invalid folder and template paths produce an error instead of creating a note
somewhere else.

## Integrations

Templater commands run before the board assigns its properties, so the template keeps
its frontmatter.

Supercharged Links styling works inside cards because the board preserves native Bases
link markup and metadata attributes.

## Configuration

Board options live in the Bases view config panel. Plugin settings store column colors
and appearance defaults.

Run the Browse icons command from the command palette to search the registered Lucide
icons. Clicking an icon copies its name.

## Contributing

Issues and pull requests are welcome. See [Contributing](CONTRIBUTING.md) before you
start.

## License

[MIT](LICENSE)
