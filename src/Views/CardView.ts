import { BasesEntry, BasesPropertyId, Menu, Modal, Notice, setTooltip } from 'obsidian';
import { getPropertyKeyFromId } from 'Utils';
import Services from '../Base/Services';
import { CoverVideos, renderCardCover } from './CardCover';
import { ColorManager } from './ColorManager';
import { BoardOptions } from './OptionsExtractor';
import { PropertyView } from './PropertyView';

interface CardViewContext {
	options: BoardOptions;
	properties: string[]; // properties to display (order)
	propertyLabels?: Record<string, string>; // property ID -> tooltip label
	colorName?: string | null;
	coverVideos?: CoverVideos; // videos of the previous render, reused by source
	cardColorMode?: 'none' | 'minimal' | 'full';
}

export class CardView {
	private options: BoardOptions;
	private properties: string[];
	private propertyLabels: Record<string, string>;
	private coverVideos?: CoverVideos;
	private colorName?: string | null;
	private cardColorMode: 'none' | 'minimal' | 'full';

	constructor(ctx: CardViewContext) {
		this.options = ctx.options;

		// Always ensure file.name is first in the properties list
		const otherProperties = ctx.properties.filter((p) => p !== 'file.name');
		this.properties = ['file.name', ...otherProperties];
		this.propertyLabels = ctx.propertyLabels ?? {};
		this.coverVideos = ctx.coverVideos;

		this.colorName = ctx.colorName;
		this.cardColorMode = ctx.cardColorMode || 'none';
	}

	render(entry: BasesEntry): HTMLElement {
		const card = createDiv('board-card');
		if (this.options.cardSize) {
			card.classList.add(`card-size-${this.options.cardSize}`);
		}
		card.setAttribute('data-path', entry.file.path);

		const openCard = async () => {
			try {
				const workspace = Services.app.workspace;
				const targetLeaf = workspace.getLeaf('tab');
				await targetLeaf.openFile(entry.file);
				workspace.setActiveLeaf(targetLeaf, { focus: true });
			} catch (error) {
				console.error(`[Bases Board] Failed to open ${entry.file.path}`, error);
				new Notice(`Could not open ${entry.file.basename}.`);
			}
		};

		card.addEventListener('contextmenu', (evt) => {
			// Pills and other editors open their own menu
			if (evt.defaultPrevented) return;
			evt.preventDefault();
			this.showFileMenu(entry, evt.pageX, evt.pageY);
		});
		card.addEventListener('keydown', (evt) => {
			if (evt.key !== 'ContextMenu' && !(evt.shiftKey && evt.key === 'F10')) return;
			evt.preventDefault();
			const bounds = card.getBoundingClientRect();
			this.showFileMenu(entry, bounds.left, bounds.bottom);
		});

		// Apply color based on mode
		if (this.colorName && this.cardColorMode !== 'none') {
			if (this.cardColorMode === 'full') {
				ColorManager.apply(card, this.colorName.toLowerCase());
			} else if (this.cardColorMode === 'minimal') {
				ColorManager.applyBorderLine(card, this.colorName.toLowerCase());
			}
		}

		// optional image
		if (this.options.imageProperty) {
			renderCardCover(
				card,
				entry.getValue(this.options.imageProperty),
				entry.file.path,
				!this.options.hideImagePlaceholder,
				this.coverVideos,
			);
		}

		// ID badge above title
		if (this.options.idProperty) {
			const idPropertyId = this.options.idProperty;
			const idValue = entry.getValue(idPropertyId);
			if (idValue?.isTruthy()) {
				const idText = idValue.toString();
				const idEl = createEl('button', {
					cls: 'card-id',
					text: idText,
					attr: {
						type: 'button',
						title: `Copy ${idText}; right-click to edit`,
						'aria-label': `Copy ID ${idText}; right-click to edit`,
					},
				});

				// Stop mouseup so card doesn't open
				idEl.addEventListener('mouseup', (evt) => {
					evt.stopPropagation();
				});

				// Left click — copy to clipboard
				idEl.addEventListener('click', (evt) => {
					evt.preventDefault();
					evt.stopPropagation();
					void navigator.clipboard
						.writeText(idText)
						.then(() => new Notice(`Copied: ${idText}`, 1500))
						.catch((error: unknown) => {
							console.error('[Bases Board] Failed to copy ID', error);
							new Notice('Could not copy the ID.');
						});
				});

				// Right click — edit value
				idEl.addEventListener('contextmenu', (evt) => {
					evt.preventDefault();
					evt.stopPropagation();
					const modal = new IdEditModal(Services.app, idText, async (newValue) => {
						const key = getPropertyKeyFromId(idPropertyId);
						const file = Services.propertyManager.getFile(entry.file.path);
						if (file)
							await Services.propertyManager.updateFrontmatter(file, key, newValue);
					});
					modal.open();
				});

				card.appendChild(idEl);
			}
		}

		// create PropertyView helper
		const propertyView = new PropertyView({
			options: this.options,
		});

		for (const prop of this.properties as BasesPropertyId[]) {
			const propEl = propertyView.render(entry, prop);
			if (propEl) {
				if (prop === 'file.name') {
					propEl.addClass('board-card-open');
					propEl.setAttr('role', 'link');
					propEl.setAttr('tabindex', '0');
					propEl.setAttr('aria-label', `Open ${entry.file.basename} in a new tab`);
					propEl.addEventListener('click', (evt) => {
						evt.preventDefault();
						evt.stopPropagation();
						void openCard();
					});
					propEl.addEventListener('keydown', (evt) => {
						if (evt.key !== 'Enter') return;
						evt.preventDefault();
						evt.stopPropagation();
						void openCard();
					});
				} else {
					// Cards show values only, so the name is a hover away
					const label = this.propertyLabels[prop] ?? getPropertyKeyFromId(prop);
					setTooltip(propEl, label, { placement: 'top' });
					propertyView.makeEditable(propEl, entry, prop);
				}
				card.appendChild(propEl);
			}
		}

		return card;
	}

	private showFileMenu(entry: BasesEntry, x: number, y: number): void {
		const menu = new Menu();
		Services.app.workspace.trigger('file-menu', menu, entry.file, 'board-card');
		menu.showAtPosition({ x, y });
	}
}

class IdEditModal extends Modal {
	constructor(
		app: import('obsidian').App,
		private currentValue: string,
		private onSubmit: (newValue: string) => Promise<void>,
	) {
		super(app);
	}

	onOpen() {
		const { contentEl, modalEl } = this;
		modalEl.addClass('board-id-edit-modal');
		contentEl.addClass('board-modal-content');

		const input = contentEl.createEl('input', { type: 'text' });
		input.value = this.currentValue;
		input.addClass('board-modal-input');

		const submit = () => {
			void this.onSubmit(input.value.trim())
				.then(() => this.close())
				.catch((error: unknown) => {
					console.error('[Bases Board] Failed to update ID', error);
					new Notice('Could not update the ID.');
				});
		};

		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') submit();
			if (e.key === 'Escape') this.close();
		});

		const btn = contentEl.createEl('button', { text: 'Save' });
		btn.addEventListener('click', submit);

		input.win.setTimeout(() => {
			input.focus();
			input.select();
		}, 50);
	}

	onClose() {
		this.contentEl.empty();
	}
}
