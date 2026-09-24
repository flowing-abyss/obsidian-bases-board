# Bases Board

[![Available in Obsidian](https://img.shields.io/badge/Available%20in%20Obsidian-7C3AED?logo=obsidian&logoColor=white&style=flat-square)](https://obsidian.md/plugins?id=bases-board)
[![Release](https://github.com/flowing-abyss/obsidian-bases-board/actions/workflows/release.yml/badge.svg)](https://github.com/flowing-abyss/obsidian-bases-board/actions/workflows/release.yml)
[![Downloads](https://img.shields.io/github/downloads/flowing-abyss/obsidian-bases-board/total?style=flat-square&label=downloads&color=blue)](https://github.com/flowing-abyss/obsidian-bases-board/releases)

<p align="center">
  <img src="assets/board-dark.png" alt="A research board in the dark theme, with experiments grouped by stage into columns and by area into rows" width="49%">
  <img src="assets/board-light.png" alt="The same research board in the light theme" width="49%">
</p>

Bases Board adds a board view to Obsidian Bases. Your notes become cards laid out in
columns and rows, and moving a card updates the note's properties. Use it as a Kanban
board or as a gallery.

## Building a board

1. Open a base, add a view and choose **Board**.
2. Pick a **Group property** to sort notes into columns.
3. Add a **Sub-group property** if you want each column split into rows.

With only a sub-group property set, the cards form a gallery instead.

Drag a card to another column or row and the board writes the new values into the note.
You can grab a card anywhere except its title, links and buttons. Clicking a title opens
the note in a new tab.

Board options live in the view's configuration panel and are saved with the view, so each
board keeps its own layout. Column colors are the exception. They belong to a property
value, so every board grouped by that property shares them.

## Cards

Cards show the properties you choose for the view. Click a value to edit it right on the
card, and hover over it to see which property it is. Links keep their Supercharged Links
styling.

- **Image property** puts a cover on top of the card. The cover can be an image or a
  video, taken from a URL, a link or a file in your vault.
- **Icon property** adds an icon before the title.
- **ID property** shows a short ID above the title. Click it to copy the ID, or
  right-click it to edit.
- **Hide empty properties** leaves out whatever a note does not have.
- **Card size** switches between small, medium and large cards.

Icons come from [Lucide](https://lucide.dev/icons/). Each entry in **Icon mapping** pairs
a value of the icon property with an icon name.

```
idea=lightbulb
training=cpu
bug=bug
```

The mapping changes what the card shows and leaves the note alone. Obsidian ships its own
copy of Lucide, which can lag behind the website. Run **Browse icons** from the command
palette to see the icons your version has, and click one to copy its name.

## Columns and rows

Each column and row header has a menu.

- **Move left** and **Move right** shift a column, **Move up** and **Move down** shift a
  row.
- **Rename** changes the label on the board. Notes keep their value, and dragging a card
  still writes the original one.
- **Hide group** and **Hide sub-group** take a column or row off the board.
- Column menus also list colors, and so do row menus in a gallery. **Color headers**,
  **Color cells** and **Color cards** decide where the color appears.

Click a row header to fold the row away. Columns listed in **Group order** stay on the
board even when they are empty, and **Hide empty groups** drops them.

## New notes

The **New note** button at the bottom of a cell creates a note that already carries that
cell's column and row values. Each board view has its own settings for it.

- **Folder** is where new notes go.
- **Template** is the note they start from. Templater commands in it run before the board
  adds its values, so your frontmatter stays intact.
- **Open after creation** takes you to the note once it is ready.

When the folder or template path is wrong, you get an error and no note is created.

## Installation

Open Settings → Community plugins, browse for **Bases Board**, then install and enable it.
You can also install it straight from
[the plugin page](https://obsidian.md/plugins?id=bases-board). The plugin needs Obsidian
1.10.3 or later.

## Contributing

Issues and pull requests are welcome. Please read [Contributing](CONTRIBUTING.md) before
you start.

## License

[MIT](LICENSE)
