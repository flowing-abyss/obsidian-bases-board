import Sortable from 'sortablejs';
import { describe, expect, it, vi } from 'vitest';
import { BoardView, type BoardViewCallbacks, type BoardViewData } from '../src/Views/BoardView';

function createData(title: string): BoardViewData {
	return {
		groupPropertyId: '',
		columns: [{ id: 'group', title, rawValue: null, count: 0 }],
		rows: [],
		items: { group: {} },
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

function pressCard(card: HTMLElement): void {
	card.dispatchEvent(
		new PointerEvent('pointerdown', {
			bubbles: true,
			cancelable: true,
			pointerType: 'touch',
			button: 0,
			isPrimary: true,
		}),
	);
}

describe('Board context menus with Sortable', () => {
	it.each([true, false])(
		'renders updates after a long press without pointerup, queued before the menu: %s',
		async (queuedBeforeMenu) => {
			vi.useFakeTimers();
			const container = document.body.createDiv();
			const board = new BoardView(container);
			try {
				const callbacks = createCallbacks();
				board.render(createData('Before menu'), callbacks);
				const cell = container.querySelector<HTMLElement>('.board-cell');
				if (!cell) throw new Error('Missing board cell');
				const card = cell.createDiv('board-card');
				const openMenu = vi.fn();
				card.addEventListener('contextmenu', openMenu);
				pressCard(card);
				expect(Sortable.dragged).toBe(card);
				if (queuedBeforeMenu) board.render(createData('After menu'), callbacks);

				card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 }));
				if (!queuedBeforeMenu) board.render(createData('After menu'), callbacks);
				await vi.advanceTimersByTimeAsync(0);

				expect(openMenu).toHaveBeenCalledOnce();
				expect(container.textContent).toContain('After menu');
				expect(Sortable.dragged).toBeNull();
				expect(callbacks.onCardDrop).not.toHaveBeenCalled();
			} finally {
				board.destroy();
				container.remove();
				vi.useRealTimers();
			}
		},
	);

	it('can choose a card again after a context menu without an intervening pointerup', () => {
		const container = document.body.createDiv();
		const board = new BoardView(container);
		try {
			const callbacks = createCallbacks();
			board.render(createData('Board'), callbacks);
			const cell = container.querySelector<HTMLElement>('.board-cell');
			if (!cell) throw new Error('Missing board cell');
			const card = cell.createDiv('board-card');
			const choose = vi.fn();
			cell.addEventListener('choose', choose);
			const previousSortable = Sortable.get(cell);
			pressCard(card);
			card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 }));

			expect(card.isConnected).toBe(true);
			expect(Sortable.dragged).toBeNull();
			expect(Sortable.get(cell)).toBeDefined();
			expect(Sortable.get(cell)).not.toBe(previousSortable);
			pressCard(card);
			expect(choose).toHaveBeenCalledTimes(2);
			expect(Sortable.dragged).toBe(card);
			expect(callbacks.onCardDrop).not.toHaveBeenCalled();
		} finally {
			board.destroy();
			container.remove();
		}
	});
});
