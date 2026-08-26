/**
 * Preserve the DOM shape used by Obsidian's embedded Bases card renderer.
 * Ecosystem integrations observe these lines when a base is embedded in a
 * Markdown view, while standalone Bases views expose the inner link directly.
 */
export function wrapEmbeddedBasesLinks(container: HTMLElement): void {
	const links = container.querySelectorAll<HTMLElement>('span.internal-link[data-href]');

	links.forEach((link) => {
		link.setAttribute('draggable', 'false');

		if (link.parentElement?.matches('.bases-cards-line')) return;

		const href = link.getAttribute('data-href');
		if (!href) return;

		const line = container.createDiv({
			cls: ['bases-cards-line', 'board-embedded-link'],
		});
		line.setAttribute('data-href', href);
		link.replaceWith(line);
		line.appendChild(link);
	});
}
