import type { App as ObsidianApp } from 'obsidian';
import type { RenderContext } from 'obsidian-test-mocks/obsidian';
import {
	App,
	BasesEntry,
	RenderContext as MockRenderContext,
	Value,
} from 'obsidian-test-mocks/obsidian';
import { describe, expect, it } from 'vitest';
import Services from '../src/Base/Services';
import { wrapEmbeddedBasesLinks } from '../src/Views/BasesLinkCompatibility';
import { PropertyView } from '../src/Views/PropertyView';

let receivedRenderContext: unknown;

class InternalLinkValue extends Value {
	constructor(private readonly link: string) {
		super();
	}

	override isTruthy(): boolean {
		return true;
	}

	override toString(): string {
		return this.link;
	}

	override renderTo(element: HTMLElement, context: RenderContext): void {
		receivedRenderContext = context;
		element.createSpan({
			attr: { 'data-href': this.link },
			cls: 'internal-link',
			text: this.link,
		});
	}
}

describe('embedded Bases link compatibility', () => {
	it('wraps native internal links in the embedded card line shape', () => {
		const fixture = document
			.createRange()
			.createContextualFragment(
				'<div><span class="internal-link" data-href="projects/Sprint">Sprint</span></div>',
			);
		const container = fixture.firstElementChild as HTMLElement;
		const link = container.firstElementChild as HTMLElement;

		wrapEmbeddedBasesLinks(container);

		const line = container.querySelector<HTMLElement>('.bases-cards-line');
		expect(line?.classList.contains('board-embedded-link')).toBe(true);
		expect(line?.getAttribute('data-href')).toBe('projects/Sprint');
		expect(line?.querySelector('.internal-link')).toBe(link);
		expect(link.getAttribute('draggable')).toBe('false');
	});

	it('does not wrap an already compatible link twice', () => {
		const fixture = document
			.createRange()
			.createContextualFragment(
				'<div><div class="bases-cards-line"><span class="internal-link" data-href="projects/Sprint">Sprint</span></div></div>',
			);
		const container = fixture.firstElementChild as HTMLElement;
		const line = container.firstElementChild as HTMLElement;
		const link = line.firstElementChild as HTMLElement;

		wrapEmbeddedBasesLinks(container);

		expect(container.querySelectorAll('.bases-cards-line')).toHaveLength(1);
		expect(line.firstElementChild).toBe(link);
		expect(link.getAttribute('draggable')).toBe('false');
	});

	it('renders a Bases entry with the app render context and compatible link markup', () => {
		const app = App.createConfigured__({ files: { 'projects/Sprint.md': '' } });
		const renderContext = MockRenderContext.create__(app).asOriginalType__();
		const file = app.vault.getFileByPath('projects/Sprint.md');
		expect(file).not.toBeNull();
		if (!file) return;

		Services.app = { renderContext } as ObsidianApp;
		const entry = BasesEntry.create__({}, file);
		entry.setValue__(
			'note.project',
			new InternalLinkValue('projects/Sprint').asOriginalType__(),
		);

		const element = new PropertyView({}).render(entry.asOriginalType__(), 'note.project');

		expect(receivedRenderContext).toBe(renderContext);
		expect(element?.querySelector('.bases-cards-line')?.getAttribute('data-href')).toBe(
			'projects/Sprint',
		);
		expect(element?.querySelector('.internal-link')?.textContent).toBe('projects/Sprint');
	});
});
