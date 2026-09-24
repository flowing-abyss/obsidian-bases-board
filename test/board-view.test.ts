import type Sortable from 'sortablejs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sortableCreate = vi.hoisted(() =>
	vi.fn((_element: HTMLElement, _options?: Sortable.Options) => ({
		destroy: vi.fn(),
	})),
);

vi.mock('sortablejs', () => ({
	default: { create: sortableCreate },
}));

import { EMPTY_GROUP_ID } from '../src/Views/BoardConstants';
import { BoardItem, BoardView, BoardViewCallbacks, BoardViewData } from '../src/Views/BoardView';
import { CardView } from '../src/Views/CardView';

function createData(title = 'Empty group'): BoardViewData {
	return {
		groupPropertyId: '',
		columns: [{ id: EMPTY_GROUP_ID, title, rawValue: null, count: 0 }],
		rows: [],
		items: { [EMPTY_GROUP_ID]: {} },
		cardOptions: {},
		cardProperties: [],
		cardPropertyLabels: {},
		columnColors: {},
		collapsedSubGroups: [],
		dropPlacement: 'sorted',
	};
}

function createCallbacks(): BoardViewCallbacks {
	return {
		onCardDrop: vi.fn(() => Promise.resolve()),
		onHideGroup: vi.fn(),
		onHideSubGroup: vi.fn(),
		onMoveGroup: vi.fn(),
		onMoveSubGroup: vi.fn(),
		onSetColumnColor: vi.fn(),
		onNewNoteClick: vi.fn(() => Promise.resolve()),
		onRenameGroup: vi.fn(),
		onRenameSubGroup: vi.fn(),
		onToggleCollapsedSubGroup: vi.fn(),
	};
}

describe('BoardView drag isolation', () => {
	beforeEach(() => sortableCreate.mockClear());
	afterEach(() => vi.useRealTimers());

	it('drags by the whole card while keeping a unique Sortable group for every board', () => {
		const first = new BoardView(document.body.createDiv());
		const second = new BoardView(document.body.createDiv());
		first.render(createData(), createCallbacks());
		second.render(createData(), createCallbacks());

		const firstOptions = sortableCreate.mock.calls[0]?.[1];
		const secondOptions = sortableCreate.mock.calls[1]?.[1];
		expect(firstOptions?.draggable).toBe('.board-card');
		expect(firstOptions?.handle).toBeUndefined();
		expect(firstOptions?.forceFallback).not.toBe(true);
		expect(firstOptions?.filter).toContain('.board-card-open');
		expect(firstOptions?.filter).toContain('.multi-select-pill');
		const firstGroup = firstOptions?.group;
		const secondGroup = secondOptions?.group;
		expect(typeof firstGroup).toBe('object');
		expect(typeof secondGroup).toBe('object');
		if (typeof firstGroup === 'object' && typeof secondGroup === 'object') {
			expect(firstGroup.name).not.toBe(secondGroup.name);
		}

		first.destroy();
		second.destroy();
	});

	it('keeps an owned native card drag inside the board boundary', () => {
		const host = document.body.createDiv();
		const container = host.createDiv();
		const board = new BoardView(container);
		board.render(createData(), createCallbacks());
		const cell = container.querySelector<HTMLElement>('.board-cell');
		const options = sortableCreate.mock.calls[0]?.[1];
		const group = options?.group;
		if (!cell) throw new Error('Expected BoardView to render a sortable cell');
		if (typeof group !== 'object' || !group.name) {
			throw new Error('Expected BoardView to configure an owned Sortable group');
		}

		const card = cell.createDiv('board-card');
		card.dataset.boardOwner = String(group.name);
		const cellDragStart = vi.fn();
		const hostDragStart = vi.fn();
		cell.addEventListener('dragstart', cellDragStart);
		host.addEventListener('dragstart', hostDragStart);
		options?.onChoose?.({ from: cell, item: card } as unknown as Sortable.SortableEvent);

		const event = new Event('dragstart', { bubbles: true, cancelable: true });
		card.dispatchEvent(event);

		expect(cellDragStart).toHaveBeenCalledTimes(1);
		expect(hostDragStart).not.toHaveBeenCalled();
		expect(event.defaultPrevented).toBe(false);
		board.destroy();
	});

	it('does not swallow idle or unowned drags', () => {
		const host = document.body.createDiv();
		const container = host.createDiv();
		const board = new BoardView(container);
		board.render(createData(), createCallbacks());
		const cell = container.querySelector<HTMLElement>('.board-cell');
		if (!cell) return;
		const hostDragStart = vi.fn();
		host.addEventListener('dragstart', hostDragStart);

		cell.createDiv('board-card').dispatchEvent(new Event('dragstart', { bubbles: true }));
		expect(hostDragStart).toHaveBeenCalledTimes(1);

		const options = sortableCreate.mock.calls[0]?.[1];
		options?.onChoose?.({ from: cell, item: cell } as Sortable.SortableEvent);
		const unownedCard = cell.createDiv('board-card');
		unownedCard.dataset.boardOwner = 'another-board';
		unownedCard.dispatchEvent(new Event('dragstart', { bubbles: true }));
		expect(hostDragStart).toHaveBeenCalledTimes(2);

		board.destroy();
	});

	it('contains active native dragover but leaves terminal events untouched', () => {
		const host = document.body.createDiv();
		const container = host.createDiv();
		const board = new BoardView(container);
		board.render(createData(), createCallbacks());
		const cell = container.querySelector<HTMLElement>('.board-cell');
		const rowCells = container.querySelector<HTMLElement>('.board-row-cells');
		if (!cell) throw new Error('Expected BoardView to render a sortable cell');
		if (!rowCells) throw new Error('Expected BoardView to render a row-cells gap');
		const options = sortableCreate.mock.calls[0]?.[1];
		const group = options?.group;
		if (typeof group !== 'object' || !group.name)
			throw new Error('Expected BoardView to configure an owned Sortable group');
		const card = cell.createDiv('board-card');
		card.dataset.boardOwner = String(group.name);
		const rowDragOver = vi.fn();
		const hostDragOver = vi.fn();
		const hostDrop = vi.fn();
		const hostDragEnd = vi.fn();
		rowCells.addEventListener('dragover', rowDragOver);
		host.addEventListener('dragover', hostDragOver);
		host.addEventListener('drop', hostDrop);
		host.addEventListener('dragend', hostDragEnd);

		rowCells.dispatchEvent(new MouseEvent('dragover', { bubbles: true, clientY: 100 }));
		expect(hostDragOver).toHaveBeenCalledTimes(1);

		options?.onChoose?.({ from: cell, item: card } as unknown as Sortable.SortableEvent);
		card.dispatchEvent(new Event('dragstart', { bubbles: true }));
		const activeDragOver = new MouseEvent('dragover', {
			bubbles: true,
			cancelable: true,
			clientY: 100,
		});
		rowCells.dispatchEvent(activeDragOver);
		rowCells.dispatchEvent(new Event('drop', { bubbles: true }));
		rowCells.dispatchEvent(new Event('dragend', { bubbles: true }));

		expect(rowDragOver).toHaveBeenCalledTimes(2);
		expect(hostDragOver).toHaveBeenCalledTimes(1);
		expect(activeDragOver.defaultPrevented).toBe(false);
		expect(hostDrop).toHaveBeenCalledTimes(1);
		expect(hostDragEnd).toHaveBeenCalledTimes(1);
		board.destroy();
	});

	it('contains an owned drag while it crosses a sibling board instance', () => {
		const host = document.body.createDiv();
		const firstContainer = host.createDiv();
		const secondContainer = host.createDiv();
		const first = new BoardView(firstContainer);
		const second = new BoardView(secondContainer);
		first.render(createData(), createCallbacks());
		second.render(createData(), createCallbacks());
		const firstCell = firstContainer.querySelector<HTMLElement>('.board-cell');
		const secondRowCells = secondContainer.querySelector<HTMLElement>('.board-row-cells');
		const firstOptions = sortableCreate.mock.calls[0]?.[1];
		const firstGroup = firstOptions?.group;
		if (!firstCell || !secondRowCells)
			throw new Error('Expected both BoardView instances to render');
		if (typeof firstGroup !== 'object' || !firstGroup.name)
			throw new Error('Expected the source board to configure an owned Sortable group');
		const card = firstCell.createDiv('board-card');
		card.dataset.boardOwner = String(firstGroup.name);
		const hostDragOver = vi.fn();
		host.addEventListener('dragover', hostDragOver);

		firstOptions?.onChoose?.({
			from: firstCell,
			item: card,
		} as unknown as Sortable.SortableEvent);
		card.dispatchEvent(new Event('dragstart', { bubbles: true }));
		secondRowCells.dispatchEvent(new MouseEvent('dragover', { bubbles: true, clientY: 100 }));

		expect(hostDragOver).not.toHaveBeenCalled();
		first.destroy();
		second.destroy();
	});

	it('keeps one external autoscroll owner across sibling board instances', () => {
		const scroller = document.body.createDiv();
		scroller.setCssStyles({ overflowY: 'auto' });
		Object.defineProperties(scroller, {
			clientHeight: { configurable: true, value: 400 },
			scrollHeight: { configurable: true, value: 1200 },
			scrollTop: { configurable: true, value: 100, writable: true },
		});
		vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue({
			x: 0,
			y: 0,
			top: 0,
			right: 600,
			bottom: 400,
			left: 0,
			width: 600,
			height: 400,
			toJSON: () => ({}),
		});
		const firstContainer = scroller.createDiv();
		const secondContainer = scroller.createDiv();
		const first = new BoardView(firstContainer);
		const second = new BoardView(secondContainer);
		first.render(createData(), createCallbacks());
		second.render(createData(), createCallbacks());
		const firstCell = firstContainer.querySelector<HTMLElement>('.board-cell');
		const firstRowCells = firstContainer.querySelector<HTMLElement>('.board-row-cells');
		const secondCell = secondContainer.querySelector<HTMLElement>('.board-cell');
		const secondRowCells = secondContainer.querySelector<HTMLElement>('.board-row-cells');
		const firstOptions = sortableCreate.mock.calls[0]?.[1];
		const firstGroup = firstOptions?.group;
		if (!firstCell || !firstRowCells || !secondCell || !secondRowCells)
			throw new Error('Expected both BoardView instances to render');
		if (typeof firstGroup !== 'object' || !firstGroup.name)
			throw new Error('Expected the source board to configure an owned Sortable group');
		const card = firstCell.createDiv('board-card');
		card.dataset.boardOwner = String(firstGroup.name);
		firstOptions?.onChoose?.({
			from: firstCell,
			item: card,
		} as unknown as Sortable.SortableEvent);
		card.dispatchEvent(new Event('dragstart', { bubbles: true }));

		let nextFrameId = 0;
		const frames: Array<{ callback: FrameRequestCallback; id: number }> = [];
		const requestFrame = vi
			.spyOn(window, 'requestAnimationFrame')
			.mockImplementation((callback) => {
				const id = ++nextFrameId;
				frames.push({ callback, id });
				return id;
			});
		const cancelFrame = vi.spyOn(window, 'cancelAnimationFrame');

		firstRowCells.dispatchEvent(new MouseEvent('dragover', { bubbles: true, clientY: 395 }));
		const firstFrame = frames.at(-1);
		secondRowCells.dispatchEvent(new MouseEvent('dragover', { bubbles: true, clientY: 395 }));
		const secondFrame = frames.at(-1);
		expect(firstFrame).toBeDefined();
		expect(secondFrame?.id).not.toBe(firstFrame?.id);
		expect(cancelFrame).toHaveBeenCalledWith(firstFrame?.id);

		firstFrame?.callback(performance.now() + 16);
		expect(scroller.scrollTop).toBe(100);
		secondFrame?.callback(performance.now() + 16);
		expect(scroller.scrollTop).toBeGreaterThan(100);

		firstRowCells.dispatchEvent(new MouseEvent('dragover', { bubbles: true, clientY: 395 }));
		const returnedFirstFrame = frames.at(-1);
		const beforeCell = scroller.scrollTop;
		secondCell.addEventListener('dragover', (event) => event.stopPropagation());
		secondCell.dispatchEvent(new MouseEvent('dragover', { bubbles: true, clientY: 395 }));
		expect(cancelFrame).toHaveBeenCalledWith(returnedFirstFrame?.id);
		returnedFirstFrame?.callback(performance.now() + 32);
		expect(scroller.scrollTop).toBe(beforeCell);

		first.destroy();
		second.destroy();
		requestFrame.mockRestore();
		cancelFrame.mockRestore();
	});

	it('autoscrolls the nearest external vertical scroller and stops in the center', () => {
		const scroller = document.body.createDiv();
		scroller.setCssStyles({ overflowY: 'auto' });
		Object.defineProperties(scroller, {
			clientHeight: { configurable: true, value: 400 },
			scrollHeight: { configurable: true, value: 1200 },
			scrollTop: { configurable: true, value: 100, writable: true },
		});
		vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue({
			x: 0,
			y: 0,
			top: 0,
			right: 600,
			bottom: 400,
			left: 0,
			width: 600,
			height: 400,
			toJSON: () => ({}),
		});
		const container = scroller.createDiv();
		const board = new BoardView(container);
		board.render(createData(), createCallbacks());
		const cell = container.querySelector<HTMLElement>('.board-cell');
		const rowCells = container.querySelector<HTMLElement>('.board-row-cells');
		if (!cell) throw new Error('Expected BoardView to render a sortable cell');
		if (!rowCells) throw new Error('Expected BoardView to render a row-cells gap');
		const options = sortableCreate.mock.calls[0]?.[1];
		const group = options?.group;
		if (typeof group !== 'object' || !group.name)
			throw new Error('Expected BoardView to configure an owned Sortable group');
		const card = cell.createDiv('board-card');
		card.dataset.boardOwner = String(group.name);
		options?.onChoose?.({ from: cell, item: card } as unknown as Sortable.SortableEvent);
		card.dispatchEvent(new Event('dragstart', { bubbles: true }));
		const frames: FrameRequestCallback[] = [];
		const requestFrame = vi
			.spyOn(window, 'requestAnimationFrame')
			.mockImplementation((callback) => {
				frames.push(callback);
				return frames.length;
			});
		const cancelFrame = vi.spyOn(window, 'cancelAnimationFrame');

		rowCells.dispatchEvent(new MouseEvent('dragover', { bubbles: true, clientY: 395 }));
		frames.shift()?.(performance.now() + 16);
		expect(scroller.scrollTop).toBeGreaterThan(100);

		const beforeCenter = scroller.scrollTop;
		rowCells.dispatchEvent(new MouseEvent('dragover', { bubbles: true, clientY: 200 }));
		frames.shift()?.(performance.now() + 32);
		expect(scroller.scrollTop).toBe(beforeCenter);

		rowCells.dispatchEvent(new MouseEvent('dragover', { bubbles: true, clientY: 395 }));
		cell.addEventListener('dragover', (event) => event.stopPropagation());
		cell.dispatchEvent(new MouseEvent('dragover', { bubbles: true, clientY: 395 }));
		expect(cancelFrame).toHaveBeenCalled();
		board.destroy();
		requestFrame.mockRestore();
		cancelFrame.mockRestore();
	});

	it('removes the exact drag boundary listeners when destroyed', () => {
		const container = document.body.createDiv();
		const addEventListener = vi.spyOn(container, 'addEventListener');
		const board = new BoardView(container);
		const dragStartRegistration = addEventListener.mock.calls.find(
			([eventName]) => eventName === 'dragstart',
		);
		const dragOverCaptureRegistration = addEventListener.mock.calls.find(
			([eventName, , capture]) => eventName === 'dragover' && capture === true,
		);
		const dragOverBubbleRegistration = addEventListener.mock.calls.find(
			([eventName, , capture]) => eventName === 'dragover' && capture !== true,
		);
		if (!dragStartRegistration || !dragOverCaptureRegistration || !dragOverBubbleRegistration)
			throw new Error('Expected BoardView to register all drag boundaries');
		const removeEventListener = vi.spyOn(container, 'removeEventListener');

		board.destroy();

		expect(removeEventListener).toHaveBeenCalledWith('dragstart', dragStartRegistration[1]);
		expect(removeEventListener).toHaveBeenCalledWith(
			'dragover',
			dragOverCaptureRegistration[1],
			true,
		);
		expect(removeEventListener).toHaveBeenCalledWith('dragover', dragOverBubbleRegistration[1]);
	});

	it('queues data updates received during a drag and renders them after drag end', async () => {
		const container = document.body.createDiv();
		const board = new BoardView(container);
		const callbacks = createCallbacks();
		board.render(createData('Before drag'), callbacks);
		const cell = container.querySelector<HTMLElement>('.board-cell');
		expect(cell).not.toBeNull();
		if (!cell) return;

		const options = sortableCreate.mock.calls[0]?.[1];
		options?.onStart?.({ from: cell } as Sortable.SortableEvent);
		board.render(createData('After drag'), callbacks);
		expect(container.textContent).toContain('Before drag');
		expect(container.textContent).not.toContain('After drag');

		options?.onEnd?.({ from: cell, to: cell, item: cell } as Sortable.SortableEvent);
		expect(container.textContent).toContain('Before drag');
		await Promise.resolve();
		expect(container.textContent).toContain('After drag');
		board.destroy();
	});

	it('holds data updates while a card property editor has focus', async () => {
		const container = document.body.createDiv();
		const board = new BoardView(container);
		const callbacks = createCallbacks();
		board.render(createData('Before edit'), callbacks);
		const editor = container
			.querySelector('.board-cell')
			?.createDiv({ cls: 'board-card-property-editor' })
			.createDiv({ attr: { contenteditable: 'true', tabindex: '0' } });
		editor?.focus();
		expect(document.activeElement).toBe(editor);

		board.render(createData('After edit'), callbacks);
		expect(container.textContent).toContain('Before edit');
		expect(container.contains(editor ?? null)).toBe(true);

		editor?.blur();
		await vi.waitFor(() => expect(container.textContent).toContain('After edit'));
		board.destroy();
	});

	it('holds a finished edit until the click that ended it has landed', async () => {
		const container = document.body.createDiv();
		const board = new BoardView(container);
		const callbacks = createCallbacks();
		board.render(createData('Before edit'), callbacks);
		const cell = container.querySelector<HTMLElement>('.board-cell');
		const editor = cell
			?.createDiv({ cls: 'board-card-property-editor' })
			.createDiv({ attr: { contenteditable: 'true', tabindex: '0' } });
		const button = cell?.createEl('button');
		const clicked = vi.fn();
		button?.addEventListener('click', clicked);
		editor?.focus();
		board.render(createData('After edit'), callbacks);
		const settle = () => new Promise((resolve) => window.setTimeout(resolve, 0));

		// Pressing another control moves focus away from the editor before the click
		button?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		button?.focus();
		await settle();
		expect(container.contains(button ?? null)).toBe(true);

		button?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
		button?.click();
		expect(clicked).toHaveBeenCalledTimes(1);
		await settle();
		expect(container.textContent).toContain('After edit');
		board.destroy();
	});

	it('renders a held update when a press ends without a click', () => {
		vi.useFakeTimers();
		const container = document.body.createDiv();
		const board = new BoardView(container);
		const callbacks = createCallbacks();
		board.render(createData('Before press'), callbacks);

		container.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		board.render(createData('After press'), callbacks);
		expect(container.textContent).toContain('Before press');

		document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
		vi.advanceTimersByTime(299);
		expect(container.textContent).toContain('Before press');
		vi.advanceTimersByTime(1);
		vi.runOnlyPendingTimers();
		expect(container.textContent).toContain('After press');
		board.destroy();
		vi.useRealTimers();
	});

	it('stops waiting for a click once the board is destroyed', () => {
		const container = document.body.createDiv();
		const board = new BoardView(container);
		const removeEventListener = vi.spyOn(document, 'removeEventListener');

		container.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		board.destroy();

		const removed = removeEventListener.mock.calls.map(([eventName]) => eventName);
		expect(removed).toEqual(expect.arrayContaining(['pointerup', 'pointercancel', 'click']));
		removeEventListener.mockRestore();
	});

	it('keeps keyboard focus on the card title across a render', () => {
		const container = document.body.createDiv();
		const board = new BoardView(container);
		const data = createData();
		data.items = {
			[EMPTY_GROUP_ID]: {
				default: [{ id: 'a.md', groupId: EMPTY_GROUP_ID, rank: 0, data: {} } as BoardItem],
			},
		};
		const cardView = vi.spyOn(CardView.prototype, 'render').mockImplementation(() => {
			const card = createDiv({ cls: 'board-card', attr: { 'data-path': 'a.md' } });
			card.createDiv({ cls: 'board-card-open', attr: { tabindex: '0' } });
			return card;
		});
		board.render(data, createCallbacks());
		container.querySelector<HTMLElement>('.board-card-open')?.focus();

		board.render(data, createCallbacks());
		const title = container.querySelector('.board-card-open');
		expect(title).not.toBeNull();
		expect(document.activeElement).toBe(title);
		cardView.mockRestore();
		board.destroy();
	});

	it('renders over a focused checkbox and keeps focus on its property row', () => {
		const container = document.body.createDiv();
		const board = new BoardView(container);
		const callbacks = createCallbacks();
		const withCard = (title: string) => {
			const data = createData(title);
			data.items = {
				[EMPTY_GROUP_ID]: {
					default: [
						{ id: 'a.md', groupId: EMPTY_GROUP_ID, rank: 0, data: {} } as BoardItem,
					],
				},
			};
			return data;
		};
		const cardView = vi.spyOn(CardView.prototype, 'render').mockImplementation(() => {
			const card = createDiv({ cls: 'board-card', attr: { 'data-path': 'a.md' } });
			card.createDiv({
				cls: 'board-card-property-editor',
				attr: { 'data-board-property': 'note.done' },
			}).createEl('input', { type: 'checkbox' });
			return card;
		});
		board.render(withCard('Before'), callbacks);
		container.querySelector<HTMLElement>('input[type="checkbox"]')?.focus();

		// A ticked box moves its card, which must not wait for focus to leave it
		board.render(withCard('After'), callbacks);
		expect(container.textContent).toContain('After');
		expect(document.activeElement).toBe(
			container.querySelector('[data-board-property="note.done"]'),
		);
		cardView.mockRestore();
		board.destroy();
	});

	it("cancels the browser's drop of the dragged card's text", () => {
		const container = document.body.createDiv();
		const board = new BoardView(container);
		board.render(createData(), createCallbacks());
		const cell = container.querySelector<HTMLElement>('.board-cell');
		if (!cell) throw new Error('Expected BoardView to render a cell');
		const drop = () => {
			const event = new Event('drop', { bubbles: true, cancelable: true });
			cell.dispatchEvent(event);
			return event.defaultPrevented;
		};

		expect(drop()).toBe(false);
		sortableCreate.mock.calls[0]?.[1]?.onChoose?.({
			from: cell,
			item: cell,
		} as unknown as Sortable.SortableEvent);
		expect(drop()).toBe(true);
		board.destroy();
	});

	it('never replays a queued render over newer data', async () => {
		const container = document.body.createDiv();
		const board = new BoardView(container);
		const callbacks = createCallbacks();
		board.render(createData('Before edit'), callbacks);
		const editor = container
			.querySelector('.board-cell')
			?.createDiv({ cls: 'board-card-property-editor' })
			.createDiv({ attr: { contenteditable: 'true', tabindex: '0' } });
		editor?.focus();
		board.render(createData('Queued'), callbacks);

		// Focus can vanish without a blur, e.g. when the editor is removed
		editor?.remove();
		board.render(createData('Latest'), callbacks);
		container.dispatchEvent(new FocusEvent('blur'));
		await new Promise((resolve) => window.setTimeout(resolve, 0));

		expect(container.textContent).toContain('Latest');
		expect(container.textContent).not.toContain('Queued');
		board.destroy();
	});

	it('moves a whole card between cells without requiring a handle', async () => {
		const container = document.body.createDiv();
		const board = new BoardView(container);
		const callbacks = createCallbacks();
		const data = createData();
		data.groupPropertyId = 'note.status';
		data.columns = [
			{ id: 'todo', title: 'Todo', rawValue: 'todo', count: 1 },
			{ id: 'done', title: 'Done', rawValue: 'done', count: 0 },
		];
		data.items = { todo: { default: [] }, done: { default: [] } };
		board.render(data, callbacks);

		const cells = container.querySelectorAll<HTMLElement>('.board-cell');
		const source = cells[0];
		const target = cells[1];
		expect(source).toBeDefined();
		expect(target).toBeDefined();
		if (!source || !target) return;
		const card = source.createDiv('board-card');
		card.dataset.itemId = 'tasks/OHS-180.md';

		const options = sortableCreate.mock.calls[0]?.[1];
		const startEvent = Object.assign(new Event('start'), { from: source, item: card });
		options?.onStart?.(startEvent as unknown as Sortable.SortableEvent);
		target.appendChild(card);
		const endEvent = Object.assign(new Event('end'), { from: source, to: target, item: card });
		options?.onEnd?.(endEvent as unknown as Sortable.SortableEvent);

		expect(callbacks.onCardDrop).not.toHaveBeenCalled();
		await vi.waitFor(() => expect(callbacks.onCardDrop).toHaveBeenCalledTimes(1));
		expect(callbacks.onCardDrop).toHaveBeenCalledWith(
			'tasks/OHS-180.md',
			'note.status',
			'done',
			undefined,
			null,
		);
		board.destroy();
	});

	it("previews a card at the place the base's sort will give it", () => {
		const container = document.body.createDiv();
		const board = new BoardView(container);
		const data = createData();
		data.groupPropertyId = 'note.status';
		data.columns = [
			{ id: 'todo', title: 'Todo', rawValue: 'todo', count: 3 },
			{ id: 'done', title: 'Done', rawValue: 'done', count: 1 },
		];
		const item = (id: string, groupId: string, rank: number) =>
			({ id, groupId, rank, data: {} }) as BoardItem;
		data.items = {
			todo: {
				default: [
					item('a.md', 'todo', 0),
					item('c.md', 'todo', 2),
					item('e.md', 'todo', 4),
				],
			},
			done: { default: [item('d.md', 'done', 3)] },
		};
		const cardView = vi
			.spyOn(CardView.prototype, 'render')
			.mockImplementation(() => createDiv('board-card'));
		board.render(data, createCallbacks());
		cardView.mockRestore();

		const [todo, done] = Array.from(container.querySelectorAll<HTMLElement>('.board-cell'));
		const dragged = done?.querySelector<HTMLElement>('.board-card');
		const options = sortableCreate.mock.calls[0]?.[1];
		expect(todo && dragged && options).toBeTruthy();
		if (!todo || !dragged || !options) return;
		const idsIn = (cell: HTMLElement) =>
			Array.from(cell.querySelectorAll<HTMLElement>('.board-card')).map(
				(el) => el.dataset.itemId,
			);

		// Sortable may insert the card anywhere under the pointer; it then moves to its sorted place
		expect(
			options.onMove?.(
				{ dragged, to: todo } as unknown as Sortable.MoveEvent,
				new Event('dragover'),
			),
		).toBe(true);
		todo.prepend(dragged);
		options.onChange?.({
			item: dragged,
			from: done,
			to: todo,
		} as unknown as Sortable.SortableEvent);
		expect(idsIn(todo)).toEqual(['a.md', 'c.md', 'd.md', 'e.md']);

		// Pointer moves inside the cell do not reorder it
		expect(
			options.onMove?.(
				{ dragged, to: todo } as unknown as Sortable.MoveEvent,
				new Event('dragover'),
			),
		).toBe(false);
		board.destroy();
	});

	it('previews a card at an end of the cell when the base sorts by modified time', () => {
		const container = document.body.createDiv();
		const board = new BoardView(container);
		const data = createData();
		data.columns = [{ id: 'todo', title: 'Todo', rawValue: 'todo', count: 2 }];
		data.items = {
			todo: {
				default: [
					{ id: 'a.md', groupId: 'todo', rank: 0, data: {} } as BoardItem,
					{ id: 'b.md', groupId: 'todo', rank: 1, data: {} } as BoardItem,
				],
			},
		};
		const cardView = vi
			.spyOn(CardView.prototype, 'render')
			.mockImplementation(() => createDiv('board-card'));
		const cells = () => Array.from(container.querySelectorAll<HTMLElement>('.board-cell'));
		const ids = (cell: HTMLElement | undefined) =>
			Array.from(cell?.querySelectorAll<HTMLElement>('.board-card') ?? []).map(
				(el) => el.dataset.itemId,
			);
		const source = document.body.createDiv('board-cell');

		for (const [placement, expected] of [
			['first', ['moved.md', 'a.md', 'b.md']],
			['last', ['a.md', 'b.md', 'moved.md']],
		] as const) {
			sortableCreate.mockClear();
			board.render({ ...data, dropPlacement: placement }, createCallbacks());
			const cell = cells()[0];
			const dragged = createDiv({ cls: 'board-card', attr: { 'data-item-id': 'moved.md' } });
			cell?.insertBefore(dragged, cell.children[1] ?? null);
			sortableCreate.mock.calls[0]?.[1]?.onChange?.({
				item: dragged,
				from: source,
				to: cell,
			} as unknown as Sortable.SortableEvent);
			expect(ids(cell)).toEqual(expected);
		}
		cardView.mockRestore();
		board.destroy();
	});

	it('scrolls a long cell to the landing place once the card stays there', async () => {
		vi.useFakeTimers();
		const scroller = document.body.createDiv();
		scroller.setCssStyles({ overflowY: 'auto' });
		Object.defineProperties(scroller, {
			clientHeight: { configurable: true, value: 400 },
			scrollHeight: { configurable: true, value: 1200 },
		});
		const rect = (top: number, height: number) =>
			({ top, bottom: top + height, height, left: 0, right: 200, width: 200 }) as DOMRect;
		vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue(rect(0, 400));
		const scrollBy = vi.fn();
		scroller.scrollBy = scrollBy;
		const board = new BoardView(scroller.createDiv());
		const data = createData();
		data.columns = [{ id: 'todo', title: 'Todo', rawValue: 'todo', count: 0 }];
		data.items = { todo: { default: [] } };
		board.render(data, createCallbacks());
		const cell = scroller.querySelector<HTMLElement>('.board-cell');
		const options = sortableCreate.mock.calls[0]?.[1];
		if (!cell || !options) throw new Error('Expected BoardView to render a sortable cell');
		const source = document.body.createDiv('board-cell');
		const card = cell.createDiv('board-card');
		const cardTop = vi.spyOn(card, 'getBoundingClientRect').mockReturnValue(rect(600, 100));
		const enterCell = () =>
			options.onChange?.({
				item: card,
				from: source,
				to: cell,
			} as unknown as Sortable.SortableEvent);

		options.onChoose?.({ from: source, item: card } as unknown as Sortable.SortableEvent);
		enterCell();
		vi.advanceTimersByTime(200);
		expect(scrollBy).not.toHaveBeenCalled();
		vi.advanceTimersByTime(50);
		expect(scrollBy).toHaveBeenCalledWith(expect.objectContaining({ top: 308 }));

		scrollBy.mockClear();
		cardTop.mockReturnValue(rect(-150, 100));
		enterCell();
		vi.advanceTimersByTime(250);
		expect(scrollBy).toHaveBeenCalledWith(expect.objectContaining({ top: -158 }));

		// A card that is already visible, or a drag that ends first, keeps the scroll
		scrollBy.mockClear();
		cardTop.mockReturnValue(rect(100, 100));
		enterCell();
		vi.advanceTimersByTime(250);
		cardTop.mockReturnValue(rect(600, 100));
		enterCell();
		options.onUnchoose?.({ from: source, item: card } as unknown as Sortable.SortableEvent);
		await Promise.resolve();
		vi.advanceTimersByTime(250);
		expect(scrollBy).not.toHaveBeenCalled();
		board.destroy();
		vi.useRealTimers();
	});

	it('preserves a null raw value when moving into the empty-value column', async () => {
		const container = document.body.createDiv();
		const board = new BoardView(container);
		const callbacks = createCallbacks();
		const data = createData();
		data.groupPropertyId = 'note.status';
		data.columns = [
			{ id: 'todo', title: 'Todo', rawValue: 'todo', count: 1 },
			{ id: EMPTY_GROUP_ID, title: 'Empty', rawValue: null, count: 0 },
		];
		data.items = { todo: { default: [] }, [EMPTY_GROUP_ID]: { default: [] } };
		board.render(data, callbacks);

		const cells = container.querySelectorAll<HTMLElement>('.board-cell');
		const source = cells[0];
		const target = cells[1];
		if (!source || !target) return;
		const card = source.createDiv('board-card');
		card.dataset.itemId = 'tasks/OHS-181.md';
		const options = sortableCreate.mock.calls[0]?.[1];
		options?.onStart?.({ from: source, item: card } as unknown as Sortable.SortableEvent);
		options?.onEnd?.({
			from: source,
			to: target,
			item: card,
		} as unknown as Sortable.SortableEvent);
		await vi.waitFor(() => expect(callbacks.onCardDrop).toHaveBeenCalledTimes(1));

		expect(callbacks.onCardDrop).toHaveBeenCalledWith(
			'tasks/OHS-181.md',
			'note.status',
			null,
			undefined,
			null,
		);
		board.destroy();
	});

	it('does not tear down the board when native drag dispatches pointercancel', async () => {
		const container = document.body.createDiv();
		const board = new BoardView(container);
		const callbacks = createCallbacks();
		board.render(createData('Stable board'), callbacks);
		const cell = container.querySelector<HTMLElement>('.board-cell');
		if (!cell) return;
		const firstSortable = sortableCreate.mock.results[0]?.value as
			| { destroy: ReturnType<typeof vi.fn> }
			| undefined;
		const options = sortableCreate.mock.calls[0]?.[1];
		options?.onStart?.({ from: cell, item: cell } as Sortable.SortableEvent);

		document.dispatchEvent(new Event('pointercancel', { bubbles: true }));
		await Promise.resolve();

		expect(firstSortable?.destroy).not.toHaveBeenCalled();
		expect(container.textContent).toContain('Stable board');
		options?.onEnd?.({ from: cell, to: cell, item: cell } as Sortable.SortableEvent);
		await Promise.resolve();
		board.destroy();
	});

	it('settles once when onUnchoose is followed by onEnd in the same event turn', async () => {
		const container = document.body.createDiv();
		const board = new BoardView(container);
		const callbacks = createCallbacks();
		board.render(createData(), callbacks);
		const cell = container.querySelector<HTMLElement>('.board-cell');
		if (!cell) return;
		const options = sortableCreate.mock.calls[0]?.[1];
		const card = cell.createDiv('board-card');
		options?.onChoose?.({ from: cell, item: card } as unknown as Sortable.SortableEvent);
		card.addClass('board-sortable-chosen', 'board-sortable-ghost');
		options?.onStart?.({ from: cell, item: card } as unknown as Sortable.SortableEvent);
		options?.onUnchoose?.({ from: cell, item: card } as unknown as Sortable.SortableEvent);
		options?.onEnd?.({
			from: cell,
			to: cell,
			item: card,
		} as unknown as Sortable.SortableEvent);

		await Promise.resolve();
		await Promise.resolve();

		expect(callbacks.onCardDrop).not.toHaveBeenCalled();
		expect(sortableCreate).toHaveBeenCalledTimes(2);
		expect(card.classList.contains('board-sortable-chosen')).toBe(false);
		expect(card.classList.contains('board-sortable-ghost')).toBe(false);
		expect(cell.classList.contains('board-drag-source')).toBe(false);
		board.destroy();
	});

	it('does not rebuild after choose and unchoose when a drag never starts', async () => {
		const container = document.body.createDiv();
		const board = new BoardView(container);
		const callbacks = createCallbacks();
		board.render(createData(), callbacks);
		const cell = container.querySelector<HTMLElement>('.board-cell');
		if (!cell) return;
		const options = sortableCreate.mock.calls[0]?.[1];
		options?.onChoose?.({ from: cell, item: cell } as Sortable.SortableEvent);
		options?.onUnchoose?.({ from: cell, item: cell } as Sortable.SortableEvent);

		await Promise.resolve();
		await Promise.resolve();

		expect(sortableCreate).toHaveBeenCalledTimes(1);
		expect(callbacks.onCardDrop).not.toHaveBeenCalled();
		board.destroy();
	});
});
