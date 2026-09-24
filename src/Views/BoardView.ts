import { BasesEntry, Menu, Notice, setIcon } from 'obsidian';
import Sortable from 'sortablejs';
import { wrapEmbeddedBasesLinks } from './BasesLinkCompatibility';
import { EMPTY_GROUP_ID } from './BoardConstants';
import { collectCoverVideos, CoverVideos } from './CardCover';
import { CardView } from './CardView';
import { ColorManager } from './ColorManager';
import { BoardOptions } from './OptionsExtractor';
import { PROPERTY_EDITOR_CLASS } from './PropertyEditor';
import { focusPropertyRow } from './PropertyView';
import { StickyHeaders } from './StickyHeaders';

export interface BoardItem {
	id: string;
	groupId: string;
	subGroupId?: string;
	rank: number; // position in the base's sorted results
	data: BasesEntry;
}

export interface BoardColumn {
	id: string;
	title: string;
	rawValue: unknown;
	count: number;
}

export interface BoardRow {
	id: string;
	title: string;
	rawValue: unknown;
	count: number;
}

export interface BoardViewData {
	groupPropertyId: string;
	subGroupPropertyId?: string | null;
	columns: BoardColumn[];
	rows: BoardRow[];
	items: Record<string, Record<string, BoardItem[]>>; // groupId -> subGroupId -> items
	cardOptions: BoardOptions;
	cardProperties: string[];
	cardPropertyLabels: Record<string, string>; // property ID -> tooltip label
	columnColors: Record<string, string>;
	collapsedSubGroups: string[];
	// Where a card dropped into another cell will land once the base re-sorts
	dropPlacement: 'sorted' | 'first' | 'last';
}

export interface BoardViewCallbacks {
	onCardDrop: (
		itemId: string,
		groupPropertyId: string,
		groupPropertyValue?: string | null,
		subGroupPropertyId?: string | null,
		subGroupPropertyValue?: string | null,
	) => Promise<void>;
	onHideGroup: (groupValue: string) => void;
	onHideSubGroup: (subGroupValue: string) => void;
	onMoveGroup: (groupValue: string, direction: 'left' | 'right') => void;
	onMoveSubGroup: (subGroupValue: string, direction: 'up' | 'down') => void;
	onSetColumnColor: (groupValue: string, color: string, isSubGroup?: boolean) => void;
	onNewNoteClick: (groupValue: unknown, subGroupValue?: unknown) => Promise<void>;
	onRenameGroup: (groupValue: string, currentLabel: string) => void;
	onRenameSubGroup: (subGroupValue: string, currentLabel: string) => void;
	onToggleCollapsedSubGroup: (subGroupId: string, collapsed: boolean) => void;
}

// A card's title, or one of its property rows
interface CardFocus {
	path: string;
	property?: string;
}

interface CardDropPayload {
	itemId: string;
	groupPropertyId: string;
	groupValue: string | null | undefined;
	subGroupPropertyId?: string | null;
	subGroupValue: string | null | undefined;
}

const COLUMN_COLORS = ColorManager.getColorNames().map(
	(name) => name.charAt(0).toUpperCase() + name.slice(1),
);
// Only interactive parts block dragging; empty card space, including the rest of a
// property row, stays a drag handle.
const DRAG_FILTER_SELECTOR =
	'a, button, input, textarea, select, video, [contenteditable="true"], .internal-link, .external-link, [data-href], .board-card-open, .multi-select-pill, .clickable-icon';
// How long a dragged card stays in a cell before the board scrolls to its landing place,
// so sweeping across columns does not make the board jump
const REVEAL_DROP_DELAY_MS = 250;
const REVEAL_DROP_MARGIN_PX = 8;
// Touch browsers dispatch the click some time after pointerup
const CLICK_AFTER_POINTERUP_MS = 300;
// Fields of a property editor that take typing, which a render would discard
const EDITOR_TEXT_FIELD = [
	'[contenteditable="true"]',
	'input:not([type="checkbox"])',
	'textarea',
	'select',
]
	.map((field) => `.${PROPERTY_EDITOR_CLASS} ${field}`)
	.join(', ');

interface DocumentDragState {
	activeBoards: Set<BoardView>;
	autoScrollOwner: BoardView | null;
	instances: Set<BoardView>;
}

const documentDragStates = new WeakMap<Document, DocumentDragState>();

function getDocumentDragState(ownerDocument: Document): DocumentDragState {
	let state = documentDragStates.get(ownerDocument);
	if (!state) {
		state = { activeBoards: new Set(), autoScrollOwner: null, instances: new Set() };
		documentDragStates.set(ownerDocument, state);
	}
	return state;
}

let boardInstanceCounter = 0;

export class BoardView {
	private container: HTMLElement;
	declare private data: BoardViewData;
	private isDragging = false;
	private sortables: Sortable[] = [];
	private readonly dragGroupName = `bases-board-${++boardInstanceCounter}`;
	private readonly documentDragState: DocumentDragState;
	private pendingRender: { data: BoardViewData; callbacks: BoardViewCallbacks } | null = null;
	private itemRanks = new Map<string, number>();
	private revealDropTimer: number | null = null;
	private pointerHeld = false;
	// Ends a hold early, so a destroyed board drops its document listeners
	private releasePointerHold: (() => void) | null = null;
	private coverVideos: CoverVideos | undefined;
	private linkCompatibilityFrame: number | null = null;
	private dragSessionId = 0;
	private dragSettleScheduled = false;
	private dragStarted = false;
	private verticalAutoScrollFrame: number | null = null;
	private verticalAutoScrollPointerY: number | null = null;
	private verticalAutoScrollSampleTime = 0;
	private verticalAutoScrollPreviousFrameTime: number | null = null;
	private verticalAutoScrollContainer: HTMLElement | null = null;
	private readonly stickyHeaders = new StickyHeaders();
	private disposed = false;
	private readonly stopExternalAutoScrollInsideSortableCell = (event: DragEvent): void => {
		if (this.documentDragState.activeBoards.size === 0) return;
		const ownerWindow = this.container.ownerDocument.defaultView;
		if (!ownerWindow || !(event.target instanceof ownerWindow.Element)) return;
		const cell = event.target.closest('.board-cell');
		if (cell && this.container.contains(cell)) {
			this.documentDragState.autoScrollOwner?.stopVerticalAutoScroll();
		}
	};
	private readonly stopOwnedCardDragFromBubbling = (event: DragEvent): void => {
		if (!this.isDragging) return;
		const ownerWindow = this.container.ownerDocument.defaultView;
		if (!ownerWindow || !(event.target instanceof ownerWindow.Element)) return;
		const card = event.target.closest<HTMLElement>('.board-card[data-board-owner]');
		if (!card || !this.container.contains(card)) return;
		if (card.dataset.boardOwner !== this.dragGroupName) return;
		this.documentDragState.activeBoards.add(this);
		event.stopPropagation();
	};
	private readonly stopActiveNativeDragOverFromBubbling = (event: DragEvent): void => {
		if (this.documentDragState.activeBoards.size === 0) return;
		this.updateVerticalAutoScroll(event.clientY);
		event.stopPropagation();
	};
	private readonly renderAfterPropertyEdit = (): void => {
		if (!this.pendingRender) return;
		// Focus lands on its next target after blur, so check once it has settled
		this.container.ownerDocument.defaultView?.setTimeout(() => {
			if (!this.disposed && !this.pointerHeld && !this.isEditingProperty()) {
				this.flushPendingRender();
			}
		}, 0);
	};
	// A click never arrives when its target is rebuilt between pointerdown and click,
	// which is exactly when a finished edit hands its queued render over
	private readonly holdRenderUntilClick = (): void => {
		if (this.pointerHeld) return;
		this.pointerHeld = true;
		const doc = this.container.ownerDocument;
		const ownerWindow = doc.defaultView;
		let fallbackTimer: number | undefined;
		const release = (): void => {
			doc.removeEventListener('pointerup', waitForClick, true);
			doc.removeEventListener('pointercancel', release, true);
			doc.removeEventListener('click', release, true);
			ownerWindow?.clearTimeout(fallbackTimer);
			this.releasePointerHold = null;
			this.pointerHeld = false;
			this.renderAfterPropertyEdit();
		};
		// A drag or a vanished target ends without a click
		const waitForClick = (): void => {
			fallbackTimer = ownerWindow?.setTimeout(release, CLICK_AFTER_POINTERUP_MS);
		};
		doc.addEventListener('pointerup', waitForClick, true);
		doc.addEventListener('pointercancel', release, true);
		doc.addEventListener('click', release, true);
		this.releasePointerHold = release;
	};
	// Sortable cancels the browser's drop on the main window's document only, so in a
	// popout the card's text would land in the field under the pointer
	private readonly preventOwnedDrop = (event: DragEvent): void => {
		if (this.isDragging) event.preventDefault();
	};

	constructor(container: HTMLElement) {
		this.container = container;
		this.documentDragState = getDocumentDragState(container.ownerDocument);
		this.documentDragState.instances.add(this);
		this.container.addEventListener(
			'dragover',
			this.stopExternalAutoScrollInsideSortableCell,
			true,
		);
		this.container.addEventListener('dragstart', this.stopOwnedCardDragFromBubbling);
		this.container.addEventListener('dragover', this.stopActiveNativeDragOverFromBubbling);
		// Captured blur, unlike focusout, still arrives when a widget rebuilds its field on blur
		this.container.addEventListener('blur', this.renderAfterPropertyEdit, true);
		this.container.addEventListener('pointerdown', this.holdRenderUntilClick, true);
		this.container.addEventListener('drop', this.preventOwnedDrop, true);
	}

	public render(data: BoardViewData, callbacks: BoardViewCallbacks) {
		// Rebuilding the cards would drop the focused editor and any unsaved input, or
		// the target of a click in progress
		if (this.isDragging || this.pointerHeld || this.isEditingProperty()) {
			this.pendingRender = { data, callbacks };
			return;
		}
		// This data supersedes anything still queued, which must not replay later
		this.pendingRender = null;
		this.data = data;

		// Capture scroll position
		const existingWrapper = this.container.querySelector('.board-board-wrapper');
		let scrollTop = 0;
		let scrollLeft = 0;
		if (existingWrapper) {
			scrollTop = existingWrapper.scrollTop;
			scrollLeft = existingWrapper.scrollLeft;
		}

		const cardFocus = this.getCardFocus();
		this.coverVideos = collectCoverVideos(this.container);
		this.destroySortables();
		this.container.empty();
		this.itemRanks.clear();

		const wrapper = this.container.createDiv('board-board-wrapper');
		if (data.cardOptions.cardSize) {
			wrapper.classList.add(`card-size-${data.cardOptions.cardSize}`);
		}

		// Render Column Headers
		const headerRow = wrapper.createDiv('board-column-headers');
		// Spacer for row headers if rows exist
		if (data.rows.length > 0) {
			headerRow.createDiv('board-column-header-spacer');
		}

		for (const column of data.columns) {
			const header = headerRow.createDiv('board-column-header');
			header.setAttr('role', 'heading');
			header.setAttr('aria-level', '3');

			// Color circle before title (use grey as default)
			if (data.cardOptions.colorHeaders && data.groupPropertyId) {
				const circle = header.createSpan('board-header-color-circle');
				const colorName = this.getColorName(column.id) || 'grey';
				ColorManager.apply(circle, colorName.toLowerCase());
			}

			// Chip for title (keeping implementation for future use)
			const chip = header.createSpan('board-header-chip');
			chip.textContent = column.title;

			// Count badge
			const countBadge = header.createSpan('board-header-count');
			countBadge.textContent = `${column.count}`;

			// Menu
			const menuBtn = header.createEl('button', {
				cls: 'board-header-menu',
				attr: { type: 'button', 'aria-label': `Actions for ${column.title}` },
			});
			setIcon(menuBtn, 'more-vertical');
			menuBtn.addEventListener('click', (evt) => {
				evt.stopPropagation();
				const menu = new Menu();

				// Color Menu (Group)
				this.addColorMenu(menu, (colorName) =>
					callbacks.onSetColumnColor(column.id, colorName),
				);

				menu.addItem((item) => {
					item.setTitle('Move left')
						.setIcon('arrow-left')
						.onClick(() => {
							callbacks.onMoveGroup(column.id, 'left');
						});
				});
				menu.addItem((item) => {
					item.setTitle('Move right')
						.setIcon('arrow-right')
						.onClick(() => {
							callbacks.onMoveGroup(column.id, 'right');
						});
				});
				menu.addItem((item) => {
					item.setTitle('Rename')
						.setIcon('pencil')
						.onClick(() => {
							callbacks.onRenameGroup(column.id, column.title);
						});
				});
				menu.addItem((item) => {
					item.setTitle('Hide group')
						.setIcon('eye-off')
						.onClick(() => {
							callbacks.onHideGroup(column.id);
						});
				});
				menu.showAtMouseEvent(evt);
			});
		}

		// Container for rows (allows for gallery view)
		const rowsContainer = wrapper.createDiv('board-rows-container');
		const isGallery = !data.groupPropertyId && !!data.subGroupPropertyId;

		if (isGallery) {
			rowsContainer.classList.add('is-gallery');
			const defaultColumn =
				data.columns.find((c) => c.id === EMPTY_GROUP_ID) || data.columns[0];

			if (defaultColumn) {
				for (const row of data.rows) {
					this.renderRow(rowsContainer, row, [defaultColumn], data.items, callbacks);
				}
			}
		} else {
			// Standard Mode
			if (data.rows.length > 0) {
				for (const row of data.rows) {
					this.renderRow(rowsContainer, row, data.columns, data.items, callbacks);
				}
			} else {
				// Single row (default)
				this.renderRow(rowsContainer, null, data.columns, data.items, callbacks);
			}
		}

		// Restore scroll position
		if (scrollTop > 0 || scrollLeft > 0) {
			wrapper.scrollTop = scrollTop;
			wrapper.scrollLeft = scrollLeft;
		}

		this.coverVideos = undefined;
		if (cardFocus) this.restoreCardFocus(wrapper, cardFocus);
		this.scheduleLinkCompatibilityPass(wrapper);
		this.stickyHeaders.track(wrapper);
	}

	// A render right after an edit would otherwise leave keyboard focus on a removed
	// title or property row
	private getCardFocus(): CardFocus | undefined {
		const active = this.container.ownerDocument.activeElement;
		if (!active || !this.container.contains(active)) return undefined;
		const path = active.closest<HTMLElement>('.board-card')?.dataset.path;
		if (!path) return undefined;
		if (active.matches('.board-card-open')) return { path };
		const property =
			active.closest<HTMLElement>('[data-board-property]')?.dataset.boardProperty;
		return property ? { path, property } : undefined;
	}

	private restoreCardFocus(root: HTMLElement, { path, property }: CardFocus): void {
		const card = Array.from(root.querySelectorAll<HTMLElement>('.board-card')).find(
			(el) => el.dataset.path === path,
		);
		if (!card) return;
		if (property === undefined) {
			card.querySelector<HTMLElement>('.board-card-open')?.focus({ preventScroll: true });
			return;
		}
		const row = Array.from(card.querySelectorAll<HTMLElement>('[data-board-property]')).find(
			(el) => el.dataset.boardProperty === property,
		);
		if (row) focusPropertyRow(row);
	}

	private renderRow(
		container: HTMLElement,
		row: BoardRow | null,
		columns: BoardColumn[],
		items: Record<string, Record<string, BoardItem[]>>,
		callbacks: BoardViewCallbacks,
	) {
		const rowWrapper = container.createDiv('board-row-wrapper');
		const isCollapsed = row ? this.data.collapsedSubGroups.includes(row.id) : false;

		if (isCollapsed) {
			rowWrapper.classList.add('collapsed');
		}

		if (row) {
			const rowHeader = rowWrapper.createDiv('board-row-header-bar');
			const collapseBtn = rowHeader.createEl('button', {
				cls: 'board-row-collapse',
				attr: {
					type: 'button',
					'aria-expanded': String(!isCollapsed),
					'aria-label': `${isCollapsed ? 'Expand' : 'Collapse'} ${row.title}`,
				},
			});
			const collapseIcon = collapseBtn.createSpan('collapse-icon');
			setIcon(collapseIcon, 'chevron-down');

			// Color circle before title (use grey as default)
			if (
				this.data.cardOptions.colorHeaders &&
				this.data.subGroupPropertyId &&
				!this.data.groupPropertyId
			) {
				const circle = collapseBtn.createSpan('board-header-color-circle');
				const colorName = this.getColorName(row.id, true) || 'grey';
				ColorManager.apply(circle, colorName.toLowerCase());
			}

			// Chip for title (keeping implementation for future use)
			const chip = collapseBtn.createSpan('board-header-chip');
			chip.classList.add('board-row-title');
			chip.textContent = row.title;

			// Count badge
			const countBadge = collapseBtn.createSpan('board-header-count');
			countBadge.textContent = `${row.count}`;

			// Menu
			const menuBtn = rowHeader.createEl('button', {
				cls: 'board-header-menu',
				attr: { type: 'button', 'aria-label': `Actions for ${row.title}` },
			});
			setIcon(menuBtn, 'more-vertical');
			menuBtn.addEventListener('click', (evt) => {
				evt.stopPropagation();
				const menu = new Menu();

				// Color Menu (Sub-Group) - Only show when no main group property exists
				if (!this.data.groupPropertyId) {
					this.addColorMenu(menu, (colorName) =>
						callbacks.onSetColumnColor(row.id, colorName, true),
					);
				}

				menu.addItem((item) => {
					item.setTitle('Move up')
						.setIcon('arrow-up')
						.onClick(() => {
							callbacks.onMoveSubGroup(row.id, 'up');
						});
				});
				menu.addItem((item) => {
					item.setTitle('Move down')
						.setIcon('arrow-down')
						.onClick(() => {
							callbacks.onMoveSubGroup(row.id, 'down');
						});
				});
				menu.addItem((item) => {
					item.setTitle('Rename')
						.setIcon('pencil')
						.onClick(() => {
							callbacks.onRenameSubGroup(row.id, row.title);
						});
				});
				menu.addItem((item) => {
					item.setTitle('Hide sub-group')
						.setIcon('eye-off')
						.onClick(() => {
							callbacks.onHideSubGroup(row.id);
						});
				});
				menu.showAtMouseEvent(evt);
			});

			collapseBtn.addEventListener('click', () => {
				const collapsed = !this.data.collapsedSubGroups.includes(row.id);
				this.data.collapsedSubGroups = collapsed
					? [...this.data.collapsedSubGroups, row.id]
					: this.data.collapsedSubGroups.filter((id) => id !== row.id);
				callbacks.onToggleCollapsedSubGroup(row.id, collapsed);
				this.render(this.data, callbacks);
			});
		}

		if (isCollapsed) return;

		const rowEl = rowWrapper.createDiv('board-row');
		const rowCells = rowEl.createDiv('board-row-cells');

		for (const column of columns) {
			const cell = rowCells.createDiv('board-cell');
			cell.setAttribute('data-group-id', column.id);
			if (row) {
				cell.setAttribute('data-subgroup-id', row.id);
			}

			// Determine color source (Group > Sub-Group), default to grey
			let effectiveColorName = 'grey';
			if (this.data.groupPropertyId) {
				effectiveColorName = this.getColorName(column.id) || 'grey';
			} else if (this.data.subGroupPropertyId && row) {
				effectiveColorName = this.getColorName(row.id, true) || 'grey';
			}
			// Apply colors based on options
			if (this.data.cardOptions.colorCells) {
				ColorManager.apply(cell, effectiveColorName.toLowerCase());
			}

			const cardColorMode = this.data.cardOptions.colorCards ? 'minimal' : 'none';

			const colItems = items[column.id];
			const rowKey = row ? row.id : 'default';
			const cellItems = colItems ? (colItems[rowKey] ?? []) : [];

			for (const item of cellItems) {
				const cardView = new CardView({
					options: this.data.cardOptions,
					properties: this.data.cardProperties,
					propertyLabels: this.data.cardPropertyLabels,
					coverVideos: this.coverVideos,
					colorName: effectiveColorName,
					cardColorMode: cardColorMode,
				});
				let cardEl: HTMLElement;
				try {
					cardEl = cardView.render(item.data);
				} catch (error) {
					console.error(`[Bases Board] Failed to render card ${item.id}`, error);
					continue;
				}
				cardEl.setAttribute('data-item-id', item.id);
				cardEl.setAttribute('data-board-owner', this.dragGroupName);
				this.itemRanks.set(item.id, item.rank);

				cell.appendChild(cardEl);
			}

			// Add "New Note" button
			const newNoteBtn = cell.createEl('button', {
				cls: 'board-new-note-button',
				text: 'New note',
				attr: { type: 'button' },
			});
			newNoteBtn.addEventListener('click', () => {
				newNoteBtn.disabled = true;
				newNoteBtn.addClass('is-loading');
				void callbacks
					.onNewNoteClick(column.rawValue, row?.rawValue)
					.catch((error) => {
						console.error('[Bases Board] Failed to create note', error);
					})
					.finally(() => {
						newNoteBtn.disabled = false;
						newNoteBtn.removeClass('is-loading');
					});
			});

			this.setupSortable(cell, callbacks);
		}
	}

	private setupSortable(el: HTMLElement, callbacks: BoardViewCallbacks) {
		try {
			this.createSortable(el, callbacks);
		} catch (error) {
			console.error('[Bases Board] Failed to initialize drag and drop', error);
		}
	}

	private createSortable(el: HTMLElement, callbacks: BoardViewCallbacks): void {
		const reduceMotion =
			el.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')
				.matches ?? false;
		const sortable = Sortable.create(el, {
			group: {
				name: this.dragGroupName,
				pull: 'clone',
				put: true,
			},
			animation: reduceMotion ? 0 : 150,
			draggable: '.board-card',
			sort: false, // Disable sorting to prevent items from shifting
			filter: DRAG_FILTER_SELECTOR,
			preventOnFilter: false,
			// In another cell the base's sort decides the card's place, not the pointer.
			// Sortable inserts the card on entry, onChange moves it to that place, and
			// onMove keeps it there while the pointer moves inside the cell.
			onMove: (evt) => evt.dragged.parentElement !== evt.to,
			onChange: (evt) => {
				if (evt.from === evt.to) return;
				this.placeAtSortedPosition(evt.item, evt.to);
				this.scheduleRevealDrop(evt.item, evt.to);
			},
			ghostClass: 'board-sortable-ghost',
			chosenClass: 'board-sortable-chosen',
			onChoose: () => {
				this.dragSessionId += 1;
				this.dragSettleScheduled = false;
				this.dragStarted = false;
				this.isDragging = true;
			},
			onStart: (evt) => {
				if (!this.isDragging) {
					this.dragSessionId += 1;
					this.dragSettleScheduled = false;
				}
				this.dragStarted = true;
				this.isDragging = true;
				evt.from.classList.add('board-drag-source');
			},
			onUnchoose: (evt) => {
				evt.from.classList.remove('board-drag-source');
				const sessionId = this.dragSessionId;
				queueMicrotask(() => {
					if (
						this.disposed ||
						sessionId !== this.dragSessionId ||
						this.dragSettleScheduled
					)
						return;
					if (!this.dragStarted) {
						this.finishDragState();
						this.flushPendingRender();
						return;
					}
					this.scheduleDragSettlement(sessionId, callbacks);
				});
			},
			onEnd: (evt) => {
				const sessionId = this.dragSessionId;
				evt.from.classList.remove('board-drag-source');

				if (evt.from === evt.to) {
					this.scheduleDragSettlement(sessionId, callbacks);
					return;
				}

				const itemId = evt.item.getAttribute('data-item-id');
				const targetCell = evt.to;
				const newGroupId = targetCell.getAttribute('data-group-id') || null;
				const newSubGroupId = targetCell.getAttribute('data-subgroup-id') || null;
				let payload: CardDropPayload | undefined;

				if (itemId && newGroupId) {
					const column = this.data.columns.find((c) => c.id === newGroupId);
					const row = this.data.rows.find((candidate) => candidate.id === newSubGroupId);
					payload = {
						itemId,
						groupPropertyId: this.data.groupPropertyId,
						groupValue: (column ? column.rawValue : newGroupId) as
							| string
							| null
							| undefined,
						subGroupPropertyId: this.data.subGroupPropertyId,
						subGroupValue: (row ? row.rawValue : newSubGroupId) as
							| string
							| null
							| undefined,
					};
				}
				this.scheduleDragSettlement(sessionId, callbacks, payload);
			},
		});
		this.sortables.push(sortable);
	}

	private addColorMenu(menu: Menu, onSelect: (colorName: string) => void): void {
		for (const colorName of COLUMN_COLORS) {
			this.addColorMenuItem(menu, colorName, onSelect);
		}
	}

	private addColorMenuItem(
		menu: Menu,
		colorName: string,
		onSelect: (colorName: string) => void,
	): void {
		menu.addItem((item) => {
			item.setTitle(`Color: ${colorName}`)
				.onClick(() => onSelect(colorName))
				.setIcon('circle');
		});
	}

	public destroy(): void {
		this.disposed = true;
		this.container.removeEventListener(
			'dragover',
			this.stopExternalAutoScrollInsideSortableCell,
			true,
		);
		this.container.removeEventListener('dragstart', this.stopOwnedCardDragFromBubbling);
		this.container.removeEventListener('dragover', this.stopActiveNativeDragOverFromBubbling);
		this.container.removeEventListener('blur', this.renderAfterPropertyEdit, true);
		this.container.removeEventListener('pointerdown', this.holdRenderUntilClick, true);
		this.container.removeEventListener('drop', this.preventOwnedDrop, true);
		this.releasePointerHold?.();
		this.dragSessionId += 1;
		this.finishDragState();
		this.documentDragState.instances.delete(this);
		this.destroySortables();
		this.pendingRender = null;
		this.cancelLinkCompatibilityPass();
		this.stickyHeaders.destroy();
		this.clearOrphanedDragArtifacts();
		this.container.empty();
	}

	private finishDragState(): void {
		this.cancelRevealDrop();
		this.isDragging = false;
		this.dragStarted = false;
		this.documentDragState.activeBoards.delete(this);
		this.stopVerticalAutoScroll();
		if (this.documentDragState.activeBoards.size === 0) {
			for (const instance of this.documentDragState.instances) {
				if (instance !== this) instance.stopVerticalAutoScroll();
			}
		}
		this.clearDragIndicators();
		this.clearOrphanedDragArtifacts();
	}

	private updateVerticalAutoScroll(clientY: number): void {
		const ownerWindow = this.container.ownerDocument.defaultView;
		if (!ownerWindow) return;
		if (this.documentDragState.autoScrollOwner !== this) {
			this.documentDragState.autoScrollOwner?.stopVerticalAutoScroll();
			this.documentDragState.autoScrollOwner = this;
		}
		this.verticalAutoScrollPointerY = clientY;
		this.verticalAutoScrollSampleTime = ownerWindow.performance.now();
		this.verticalAutoScrollContainer ??= this.findExternalVerticalScrollContainer();
		if (!this.verticalAutoScrollContainer || this.verticalAutoScrollFrame !== null) return;
		this.verticalAutoScrollFrame = ownerWindow.requestAnimationFrame(
			this.runVerticalAutoScrollFrame,
		);
	}

	private readonly runVerticalAutoScrollFrame = (frameTime: number): void => {
		this.verticalAutoScrollFrame = null;
		const ownerWindow = this.container.ownerDocument.defaultView;
		const scrollContainer = this.verticalAutoScrollContainer;
		const pointerY = this.verticalAutoScrollPointerY;
		if (
			!ownerWindow ||
			this.documentDragState.activeBoards.size === 0 ||
			this.documentDragState.autoScrollOwner !== this ||
			!scrollContainer?.isConnected ||
			pointerY === null ||
			frameTime - this.verticalAutoScrollSampleTime > 300
		) {
			this.stopVerticalAutoScroll();
			return;
		}

		const bounds = scrollContainer.getBoundingClientRect();
		const edgeSize = Math.min(48, bounds.height / 4);
		let proximity = 0;
		if (pointerY < bounds.top + edgeSize) {
			proximity = -Math.min(1, (bounds.top + edgeSize - pointerY) / edgeSize);
		} else if (pointerY > bounds.bottom - edgeSize) {
			proximity = Math.min(1, (pointerY - (bounds.bottom - edgeSize)) / edgeSize);
		}

		if (proximity === 0) {
			this.verticalAutoScrollPreviousFrameTime = null;
			return;
		}

		const previousFrameTime = this.verticalAutoScrollPreviousFrameTime ?? frameTime - 16;
		const elapsed = Math.min(32, Math.max(0, frameTime - previousFrameTime));
		this.verticalAutoScrollPreviousFrameTime = frameTime;
		const pixelsPerFrame = 14 * Math.sign(proximity) * proximity * proximity;
		const nextScrollTop = scrollContainer.scrollTop + pixelsPerFrame * (elapsed / 16);
		scrollContainer.scrollTop = Math.max(
			0,
			Math.min(scrollContainer.scrollHeight - scrollContainer.clientHeight, nextScrollTop),
		);
		this.verticalAutoScrollFrame = ownerWindow.requestAnimationFrame(
			this.runVerticalAutoScrollFrame,
		);
	};

	private findExternalVerticalScrollContainer(): HTMLElement | null {
		const ownerWindow = this.container.ownerDocument.defaultView;
		if (!ownerWindow) return null;
		let candidate = this.container.parentElement;
		while (candidate) {
			const overflowY = ownerWindow.getComputedStyle(candidate).overflowY;
			if (
				(overflowY === 'auto' || overflowY === 'scroll') &&
				candidate.scrollHeight > candidate.clientHeight
			) {
				return candidate;
			}
			candidate = candidate.parentElement;
		}
		return null;
	}

	private stopVerticalAutoScroll(): void {
		const ownerWindow = this.container.ownerDocument.defaultView;
		if (ownerWindow && this.verticalAutoScrollFrame !== null) {
			ownerWindow.cancelAnimationFrame(this.verticalAutoScrollFrame);
		}
		this.verticalAutoScrollFrame = null;
		this.verticalAutoScrollPointerY = null;
		this.verticalAutoScrollSampleTime = 0;
		this.verticalAutoScrollPreviousFrameTime = null;
		this.verticalAutoScrollContainer = null;
		if (this.documentDragState.autoScrollOwner === this) {
			this.documentDragState.autoScrollOwner = null;
		}
	}

	private scheduleDragSettlement(
		sessionId: number,
		callbacks: BoardViewCallbacks,
		payload?: CardDropPayload,
	): void {
		if (this.dragSettleScheduled) return;
		this.dragSettleScheduled = true;

		queueMicrotask(() => {
			const dropPromise = payload
				? Promise.resolve().then(() =>
						callbacks.onCardDrop(
							payload.itemId,
							payload.groupPropertyId,
							payload.groupValue,
							payload.subGroupPropertyId,
							payload.subGroupValue,
						),
					)
				: null;

			if (!this.disposed && sessionId === this.dragSessionId) {
				this.finishDragState();
				if (!this.flushPendingRender()) this.render(this.data, callbacks);
			}

			void dropPromise?.catch((error: unknown) => {
				console.error('[Bases Board] Failed to move card', error);
				new Notice('Could not move the card.');
				if (!this.disposed && sessionId === this.dragSessionId) {
					this.render(this.data, callbacks);
				}
			});
		});
	}

	private clearDragIndicators(): void {
		this.container.querySelectorAll('.board-drag-source').forEach((el) => {
			el.classList.remove('board-drag-source');
		});
	}

	private clearOrphanedDragArtifacts(): void {
		this.container
			.querySelectorAll('.board-sortable-chosen, .board-sortable-ghost, .board-sortable-drag')
			.forEach((el) => {
				el.classList.remove(
					'board-sortable-chosen',
					'board-sortable-ghost',
					'board-sortable-drag',
				);
			});
	}

	private destroySortables(): void {
		for (const sortable of this.sortables) {
			sortable.destroy();
		}
		this.sortables = [];
	}

	private placeAtSortedPosition(card: HTMLElement, cell: HTMLElement): void {
		const cards = Array.from(cell.children).filter(
			(el): el is HTMLElement => el !== card && el.matches('.board-card'),
		);
		const anchor = cards[this.getDropIndex(card, cards)];
		if (anchor) {
			if (card.nextElementSibling !== anchor) cell.insertBefore(card, anchor);
			return;
		}
		const last = cards[cards.length - 1];
		if (last) last.after(card);
		else cell.prepend(card);
	}

	// In a long cell the landing place can be off screen
	private scheduleRevealDrop(card: HTMLElement, cell: HTMLElement): void {
		this.cancelRevealDrop();
		const ownerWindow = this.container.ownerDocument.defaultView;
		if (!ownerWindow) return;
		this.revealDropTimer = ownerWindow.setTimeout(() => {
			this.revealDropTimer = null;
			if (this.disposed || !this.isDragging || card.parentElement !== cell) return;
			this.revealVertically(card);
		}, REVEAL_DROP_DELAY_MS);
	}

	private cancelRevealDrop(): void {
		if (this.revealDropTimer === null) return;
		this.container.ownerDocument.defaultView?.clearTimeout(this.revealDropTimer);
		this.revealDropTimer = null;
	}

	// Vertical only: a sideways scroll would move the pointer onto another column and
	// send the card there. Scrolling toward the card keeps the pointer in its cell.
	private revealVertically(card: HTMLElement): void {
		const ownerWindow = this.container.ownerDocument.defaultView;
		if (!ownerWindow) return;
		let scroller = card.parentElement;
		while (scroller) {
			const { overflowY } = ownerWindow.getComputedStyle(scroller);
			const scrollable = overflowY === 'auto' || overflowY === 'scroll';
			if (scrollable && scroller.scrollHeight > scroller.clientHeight) break;
			scroller = scroller.parentElement;
		}
		if (!scroller) return;

		const view = scroller.getBoundingClientRect();
		// Column headers and the header of the card's row stick to the top of the view
		const header = card
			.closest('.board-board-wrapper')
			?.querySelector(':scope > .board-column-headers');
		const rowHeader = card
			.closest('.board-row-wrapper')
			?.querySelector(':scope > .board-row-header-bar');
		const covered = [header, rowHeader].reduce(
			(height, el) => height + (el?.getBoundingClientRect().height ?? 0),
			0,
		);
		const top = view.top + covered + REVEAL_DROP_MARGIN_PX;
		const bottom = view.bottom - REVEAL_DROP_MARGIN_PX;
		const target = card.getBoundingClientRect();
		let delta = 0;
		if (target.top < top) delta = target.top - top;
		else if (target.bottom > bottom) delta = Math.min(target.bottom - bottom, target.top - top);
		if (delta === 0) return;

		const reduceMotion =
			ownerWindow.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
		scroller.scrollBy({ top: delta, behavior: reduceMotion ? 'instant' : 'smooth' });
	}

	private getDropIndex(card: HTMLElement, cards: HTMLElement[]): number {
		const { dropPlacement } = this.data;
		if (dropPlacement === 'first') return 0;
		if (dropPlacement === 'last') return cards.length;
		// Only the group values change, so neighbours keep their order relative to the card
		const rankOf = (el: HTMLElement) => this.itemRanks.get(el.dataset.itemId ?? '') ?? Infinity;
		const rank = rankOf(card);
		return cards.filter((el) => rankOf(el) < rank).length;
	}

	// A focused checkbox or pill has no input to lose, so it does not hold back renders
	private isEditingProperty(): boolean {
		const active = this.container.ownerDocument.activeElement;
		return !!active && this.container.contains(active) && active.matches(EDITOR_TEXT_FIELD);
	}

	private flushPendingRender(): boolean {
		const pending = this.pendingRender;
		if (!pending || this.isDragging) return false;
		this.pendingRender = null;
		this.render(pending.data, pending.callbacks);
		return true;
	}

	private scheduleLinkCompatibilityPass(container: HTMLElement): void {
		this.cancelLinkCompatibilityPass();
		const ownerWindow = container.ownerDocument.defaultView;
		if (!ownerWindow || typeof ownerWindow.requestAnimationFrame !== 'function') {
			wrapEmbeddedBasesLinks(container);
			return;
		}
		this.linkCompatibilityFrame = ownerWindow.requestAnimationFrame(() => {
			this.linkCompatibilityFrame = null;
			if (container.isConnected) wrapEmbeddedBasesLinks(container);
		});
	}

	private cancelLinkCompatibilityPass(): void {
		if (this.linkCompatibilityFrame === null) return;
		const ownerWindow = this.container.ownerDocument.defaultView;
		if (ownerWindow && typeof ownerWindow.cancelAnimationFrame === 'function') {
			ownerWindow.cancelAnimationFrame(this.linkCompatibilityFrame);
		}
		this.linkCompatibilityFrame = null;
	}

	private getColorName(groupValue: string, isSubGroup = false): string {
		const propertyId = isSubGroup ? this.data.subGroupPropertyId : this.data.groupPropertyId;
		const key = `${propertyId}:${groupValue}`;
		const colorName = this.data.columnColors[key];
		return colorName || '';
	}
}
