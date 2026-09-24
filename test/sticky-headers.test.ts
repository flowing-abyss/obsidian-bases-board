import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StickyHeaders } from '../src/Views/StickyHeaders';

const observers: FakeResizeObserver[] = [];

class FakeResizeObserver {
	readonly observed = new Set<Element>();
	disconnected = false;

	constructor(private readonly callback: () => void) {
		observers.push(this);
	}

	observe(el: Element): void {
		this.observed.add(el);
	}

	disconnect(): void {
		this.disconnected = true;
		this.observed.clear();
	}

	resize(): void {
		this.callback();
	}
}

function place(el: Element, top: number, height: number): void {
	vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
		top,
		bottom: top + height,
		height,
		left: 0,
		right: 600,
		width: 600,
	} as DOMRect);
}

// A board of two rows, the second folded, under a 40px header with an 8px gap. The
// header is placed where it would be after following the note, far below its rows' top.
function renderBoard(parent: HTMLElement, scale = 1) {
	const wrapper = parent.createDiv('board-board-wrapper');
	const header = wrapper.createDiv('board-column-headers');
	header.setCssStyles({ marginBottom: '8px' });
	const rows = wrapper.createDiv('board-rows-container');
	const open = rows.createDiv('board-row-wrapper');
	const openBar = open.createDiv('board-row-header-bar');
	const cards = open.createDiv('board-row');
	const folded = rows.createDiv('board-row-wrapper collapsed');
	const foldedBar = folded.createDiv('board-row-header-bar');

	place(header, 400, 40 * scale);
	place(rows, 200, 600 * scale);
	place(open, 200, 300 * scale);
	place(cards, 200 + 40 * scale, 260 * scale);
	place(folded, 200 + 312 * scale, 30 * scale);
	Object.defineProperty(rows, 'offsetHeight', { configurable: true, value: 600 });
	return { wrapper, header, openBar, foldedBar };
}

const vars = (el: HTMLElement) => ({
	from: parseFloat(el.style.getPropertyValue('--board-sticky-from')),
	to: parseFloat(el.style.getPropertyValue('--board-sticky-to')),
	travel: el.style.getPropertyValue('--board-sticky-travel'),
});

describe('StickyHeaders', () => {
	beforeEach(() => {
		observers.length = 0;
		vi.stubGlobal('ResizeObserver', FakeResizeObserver);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		document.body.empty();
	});

	it('gives sub-group headers the height of the column headers to stick below', () => {
		const { wrapper, header } = renderBoard(document.body.createDiv());
		new StickyHeaders().track(wrapper);
		observers[0]?.resize();

		expect(wrapper.style.getPropertyValue('--board-column-headers-height')).toBe('40px');
		// Outside a note the board scrolls itself and sticky positioning is enough
		expect(header.style.getPropertyValue('--board-sticky-travel')).toBe('');
	});

	it('lets headers of an embedded board follow the note until their rows end', () => {
		const embed = document.body.createDiv('bases-embed');
		place(embed, 100, 1000);
		const { wrapper, header, openBar, foldedBar } = renderBoard(embed);
		new StickyHeaders().track(wrapper);
		const observer = observers[0];
		expect(observer?.observed.has(embed)).toBe(true);
		observer?.resize();

		// Starts 52px into the embed and follows it past all 600px of rows
		expect(vars(header).from).toBeCloseTo(5.2);
		expect(vars(header).to).toBeCloseTo(65.2);
		expect(vars(header).travel).toBe('600px');
		// Sticks 40px lower, below the column headers, for as long as its cards last
		expect(vars(openBar).from).toBeCloseTo(6);
		expect(vars(openBar).to).toBeCloseTo(32);
		expect(vars(openBar).travel).toBe('260px');
		expect(vars(foldedBar).from).toBeCloseTo(37.2);
		expect(vars(foldedBar).to).toBeCloseTo(37.2);
		expect(vars(foldedBar).travel).toBe('0px');
	});

	it('measures a board zoomed on a canvas in its own pixels', () => {
		const embed = document.body.createDiv('bases-embed');
		place(embed, 100, 500);
		const { wrapper, header, openBar } = renderBoard(embed, 0.5);
		new StickyHeaders().track(wrapper);
		observers[0]?.resize();

		expect(wrapper.style.getPropertyValue('--board-column-headers-height')).toBe('40px');
		// Shares are ratios of the zoomed embed, distances are back in the board's pixels
		expect(vars(header).from).toBeCloseTo(15.2);
		expect(vars(header).to).toBeCloseTo(75.2);
		expect(vars(header).travel).toBe('600px');
		expect(vars(openBar).from).toBeCloseTo(16);
		expect(vars(openBar).travel).toBe('260px');
	});

	it('keeps the last measurements while the board is hidden', () => {
		const embed = document.body.createDiv('bases-embed');
		place(embed, 100, 1000);
		const { wrapper, header } = renderBoard(embed);
		new StickyHeaders().track(wrapper);
		const observer = observers[0];
		observer?.resize();

		for (const el of [embed, ...Array.from(wrapper.querySelectorAll('*'))]) place(el, 0, 0);
		observer?.resize();
		expect(wrapper.style.getPropertyValue('--board-column-headers-height')).toBe('40px');
		expect(vars(header).travel).toBe('600px');
	});

	it('observes again from the window a board moves to', () => {
		const { wrapper } = renderBoard(document.body.createDiv());
		let migrate: (() => void) | undefined;
		const stopWatching = vi.fn();
		vi.spyOn(wrapper, 'onWindowMigrated').mockImplementation((listener) => {
			migrate = () => {
				listener(window);
			};
			return stopWatching;
		});
		new StickyHeaders().track(wrapper);
		migrate?.();

		expect(observers).toHaveLength(2);
		expect(observers[0]?.disconnected).toBe(true);
		expect(stopWatching).toHaveBeenCalledTimes(1);
	});

	it('stops measuring a replaced or destroyed board', () => {
		const sticky = new StickyHeaders();
		sticky.track(renderBoard(document.body.createDiv()).wrapper);
		sticky.track(renderBoard(document.body.createDiv()).wrapper);
		expect(observers[0]?.disconnected).toBe(true);
		sticky.destroy();
		expect(observers[1]?.disconnected).toBe(true);
	});
});
