// A board embedded in a note sits in one of these; styles.css gives it a view timeline
const EMBED_SELECTOR = '.bases-embed, .block-language-base';

// A header that follows the note, from `start` pixels past the top of the embed
interface Follow {
	el: HTMLElement;
	start: number;
	travel: number;
}

/**
 * Keeps a board's column headers, and each sub-group's header within its row, in sight
 * while the board scrolls. In the board's own scroll area sticky positioning does this
 * and only needs the height of the column headers. A board embedded in a note scrolls
 * with the note instead, beyond the reach of sticky positioning, so styles.css moves
 * the headers along with the note's scroll. This measures where each header starts to
 * follow and how far it may go, and measures again whenever the board resizes.
 */
export class StickyHeaders {
	private observer: ResizeObserver | null = null;
	private stopWatchingWindow: (() => void) | null = null;

	track(wrapper: HTMLElement): void {
		this.destroy();
		// A board moved to another window needs an observer from that window
		this.stopWatchingWindow = wrapper.onWindowMigrated(() => this.track(wrapper));
		const ownerWindow = wrapper.ownerDocument.defaultView;
		if (typeof ownerWindow?.ResizeObserver !== 'function') return;
		const observer = new ownerWindow.ResizeObserver(() => measure(wrapper, ownerWindow));
		// Headers only move when something above them or in their row changes size
		const embed = wrapper.closest(EMBED_SELECTOR);
		if (embed) observer.observe(embed);
		wrapper
			.querySelectorAll(
				':scope > .board-column-headers, :scope > .board-rows-container > .board-row-wrapper',
			)
			.forEach((el) => observer.observe(el));
		this.observer = observer;
	}

	destroy(): void {
		this.stopWatchingWindow?.();
		this.stopWatchingWindow = null;
		this.observer?.disconnect();
		this.observer = null;
	}
}

function measure(wrapper: HTMLElement, ownerWindow: Window): void {
	const header = wrapper.querySelector<HTMLElement>(':scope > .board-column-headers');
	const rows = wrapper.querySelector<HTMLElement>(':scope > .board-rows-container');
	const rowsRect = rows?.getBoundingClientRect();
	// A hidden board has nothing to measure
	if (!header || !rows || !rowsRect?.height) return;
	// Canvas zooms with a transform, which scales rects but not the lengths set here.
	// offsetHeight is rounded, so a difference below a pixel is no zoom.
	const layoutHeight = rows.offsetHeight;
	const scale =
		layoutHeight && Math.abs(rowsRect.height - layoutHeight) >= 1
			? rowsRect.height / layoutHeight
			: 1;
	// Unrounded, so a sub-group header meets the column headers without a seam
	const headerHeight = header.getBoundingClientRect().height;

	// Everything is read before anything is written, so the layout is computed once
	const embedRect = wrapper.closest(EMBED_SELECTOR)?.getBoundingClientRect();
	const embedHeight = embedRect?.height ?? 0;
	const follows: Follow[] = [];
	if (embedRect && embedHeight) {
		// The headers may be moved already, but the rows they sit above never are
		const headerGap = parseFloat(ownerWindow.getComputedStyle(header).marginBottom) || 0;
		const headerTop = rowsRect.top - headerGap * scale - headerHeight;
		follows.push({ el: header, start: headerTop - embedRect.top, travel: rowsRect.height });

		for (const row of Array.from(rows.children)) {
			const bar = row.querySelector<HTMLElement>(':scope > .board-row-header-bar');
			if (!bar) continue;
			// A folded row has no cards to follow
			const cards = row.querySelector(':scope > .board-row');
			follows.push({
				el: bar,
				start: row.getBoundingClientRect().top - embedRect.top - headerHeight,
				travel: cards?.getBoundingClientRect().height ?? 0,
			});
		}
	}

	wrapper.setCssProps({ '--board-column-headers-height': `${headerHeight / scale}px` });
	for (const { el, start, travel } of follows) {
		// The embed's view timeline runs while it crosses the top of the note, so a distance
		// scrolled past its top is that share of its height
		const share = (offset: number) => `${(offset * 100) / embedHeight}%`;
		const distance = Math.max(0, travel);
		el.setCssProps({
			'--board-sticky-from': share(start),
			'--board-sticky-to': share(start + distance),
			'--board-sticky-travel': `${distance / scale}px`,
		});
	}
}
