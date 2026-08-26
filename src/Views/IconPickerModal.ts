import { App, Modal, Notice, getIconIds, setIcon } from 'obsidian';

const ICONS_PER_PAGE = 300;

export class IconPickerModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl, modalEl } = this;
		modalEl.addClass('icon-picker-modal');
		contentEl.empty();
		contentEl.addClass('icon-picker-modal-content');

		const allIcons = getIconIds().sort((a, b) => a.localeCompare(b));

		const searchEl = contentEl.createEl('input', {
			type: 'text',
			placeholder: 'Search icons…',
		});
		searchEl.addClass('icon-picker-search');

		const hint = contentEl.createEl('p', {
			cls: 'icon-picker-hint',
			text: `${allIcons.length} icons — click to copy name`,
		});

		const gridEl = contentEl.createDiv('icon-picker-grid');

		const render = (icons: string[]) => {
			gridEl.empty();
			const slice = icons.slice(0, ICONS_PER_PAGE);
			for (const id of slice) {
				const item = gridEl.createEl('button', {
					cls: 'icon-picker-item',
					attr: { type: 'button', 'aria-label': `Copy icon name ${id}` },
				});
				const iconWrap = item.createDiv('icon-picker-icon');
				setIcon(iconWrap, id);
				item.createDiv({ cls: 'icon-picker-name', text: id });
				item.addEventListener('click', () => {
					void navigator.clipboard
						.writeText(id)
						.then(() => new Notice(`Copied: ${id}`, 1500))
						.catch((error: unknown) => {
							console.error('[Bases Board] Failed to copy icon name', error);
							new Notice('Could not copy the icon name.');
						});
				});
			}
			if (icons.length > ICONS_PER_PAGE) {
				gridEl.createEl('p', {
					cls: 'icon-picker-more',
					text: `Showing ${ICONS_PER_PAGE} of ${icons.length} — refine your search`,
				});
			}
		};

		render(allIcons);

		searchEl.addEventListener('input', () => {
			const q = searchEl.value.toLowerCase().trim();
			const filtered = q ? allIcons.filter((id) => id.includes(q)) : allIcons;
			hint.textContent = `${filtered.length} icons — click to copy name`;
			render(filtered);
		});

		searchEl.win.setTimeout(() => {
			searchEl.focus();
		}, 50);
	}

	onClose() {
		this.contentEl.empty();
	}
}
