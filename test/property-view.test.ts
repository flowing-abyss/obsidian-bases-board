import type { BasesPropertyId, App as ObsidianApp } from 'obsidian';
import type { RenderContext } from 'obsidian-test-mocks/obsidian';
import {
	App,
	BasesEntry,
	BooleanValue,
	RenderContext as MockRenderContext,
	NullValue,
	NumberValue,
	StringValue,
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

	it('turns note values into editors on demand and keeps formulas read-only', () => {
		const app = App.createConfigured__({
			files: { 'projects/Sprint.md': '', 'projects/Sprint.pdf': '' },
		});
		const renderContext = MockRenderContext.create__(app).asOriginalType__();
		const file = app.vault.getFileByPath('projects/Sprint.md');
		const pdf = app.vault.getFileByPath('projects/Sprint.pdf');
		expect(file && pdf).toBeTruthy();
		if (!file || !pdf) return;

		const widget = {
			validate: () => true,
			render: (el: HTMLElement) => el.createDiv({ cls: 'multi-select-container' }),
		};
		Services.app = {
			renderContext,
			metadataTypeManager: { getTypeInfo: () => ({ expected: widget, inferred: widget }) },
			metadataCache: { getFileCache: () => ({ frontmatter: { category: ['[[a]]'] } }) },
		} as unknown as ObsidianApp;
		const entry = BasesEntry.create__({}, file);
		entry.setValue__('note.category', new InternalLinkValue('a').asOriginalType__());
		entry.setValue__('formula.type', new InternalLinkValue('b').asOriginalType__());
		const view = new PropertyView({});

		const editable = view.render(entry.asOriginalType__(), 'note.category');
		if (!editable) throw new Error('Expected a rendered value');
		expect(editable.querySelector('.internal-link')?.textContent).toBe('a');
		expect(view.canEdit(entry.asOriginalType__(), 'note.category')).toBe(true);
		expect(
			view.renderEditor(editable, entry.asOriginalType__(), 'note.category'),
		).not.toBeNull();
		expect(editable.classList.contains('board-card-property-editor')).toBe(true);
		// Only lists borrow the table cell marker, which right-aligns numbers
		expect(editable.classList.contains('bases-table-cell')).toBe(false);
		expect(editable.classList.contains('card-prop')).toBe(false);
		expect(editable.dataset.propertyKey).toBe('category');
		expect(editable.querySelector('.internal-link')).toBeNull();
		expect(editable.querySelector('.card-prop > .multi-select-container')).not.toBeNull();

		const formula = view.render(entry.asOriginalType__(), 'formula.type');
		if (!formula) throw new Error('Expected a rendered formula');
		expect(view.canEdit(entry.asOriginalType__(), 'formula.type')).toBe(false);
		expect(view.renderEditor(formula, entry.asOriginalType__(), 'formula.type')).toBeNull();
		expect(formula.querySelector('.internal-link')?.textContent).toBe('b');

		// Only notes have frontmatter
		const attachment = BasesEntry.create__({}, pdf).asOriginalType__();
		expect(view.canEdit(attachment, 'note.category')).toBe(false);
	});

	it('keeps links clickable and checkboxes one click away', () => {
		const app = App.createConfigured__({ files: { 'projects/Sprint.md': '' } });
		const file = app.vault.getFileByPath('projects/Sprint.md');
		if (!file) throw new Error('Missing test note');
		const widget = {
			validate: () => true,
			render: (el: HTMLElement) => el.createEl('input', { type: 'checkbox' }),
		};
		Services.app = {
			renderContext: MockRenderContext.create__(app).asOriginalType__(),
			metadataTypeManager: { getTypeInfo: () => ({ expected: widget, inferred: widget }) },
			metadataCache: { getFileCache: () => ({ frontmatter: {} }) },
		} as unknown as ObsidianApp;
		const entry = BasesEntry.create__({}, file);
		entry.setValue__('note.project', new InternalLinkValue('b').asOriginalType__());
		entry.setValue__('note.done', BooleanValue.create__(true).asOriginalType__());
		const view = new PropertyView({});

		const project = view.render(entry.asOriginalType__(), 'note.project');
		if (!project) throw new Error('Expected a rendered value');
		view.makeEditable(project, entry.asOriginalType__(), 'note.project');
		project.querySelector<HTMLElement>('.internal-link')?.click();
		expect(project.classList.contains('board-card-property-editor')).toBe(false);

		const done = view.render(entry.asOriginalType__(), 'note.done');
		if (!done) throw new Error('Expected a rendered value');
		view.makeEditable(done, entry.asOriginalType__(), 'note.done');
		expect(done.querySelector('input[type="checkbox"]:not(:disabled)')).not.toBeNull();
	});

	it('shows a list as editable pills right away', () => {
		const app = App.createConfigured__({ files: { 'projects/Sprint.md': '' } });
		const file = app.vault.getFileByPath('projects/Sprint.md');
		if (!file) throw new Error('Missing test note');
		const widget = {
			type: 'multitext',
			validate: () => true,
			render: (el: HTMLElement) =>
				el.createDiv('multi-select-container').createDiv('multi-select-pill'),
		};
		Services.app = {
			renderContext: MockRenderContext.create__(app).asOriginalType__(),
			metadataTypeManager: { getTypeInfo: () => ({ expected: widget, inferred: widget }) },
			metadataCache: { getFileCache: () => ({ frontmatter: { milestone: ['[[a]]'] } }) },
		} as unknown as ObsidianApp;
		const entry = BasesEntry.create__({}, file);
		entry.setValue__('note.milestone', new InternalLinkValue('a').asOriginalType__());
		const view = new PropertyView({});
		const milestone = view.render(entry.asOriginalType__(), 'note.milestone');
		if (!milestone) throw new Error('Expected a rendered value');

		view.makeEditable(milestone, entry.asOriginalType__(), 'note.milestone');
		expect(milestone.querySelector('.multi-select-pill')).not.toBeNull();
		// Supercharged Links styles pills of embedded bases inside table cells only
		expect(milestone.classList.contains('bases-table-cell')).toBe(true);
	});

	it('leaves values alone when Obsidian has no property editors', () => {
		const app = App.createConfigured__({ files: { 'projects/Sprint.md': '' } });
		const file = app.vault.getFileByPath('projects/Sprint.md');
		if (!file) throw new Error('Missing test note');
		Services.app = {
			renderContext: MockRenderContext.create__(app).asOriginalType__(),
			metadataCache: { getFileCache: () => ({ frontmatter: { status: 'todo' } }) },
		} as unknown as ObsidianApp;
		const entry = BasesEntry.create__({}, file);
		entry.setValue__('note.status', new InternalLinkValue('a').asOriginalType__());
		const view = new PropertyView({});
		const status = view.render(entry.asOriginalType__(), 'note.status');
		if (!status) throw new Error('Expected a rendered value');

		view.makeEditable(status, entry.asOriginalType__(), 'note.status');
		expect(status.hasAttribute('tabindex')).toBe(false);
		expect(status.classList.contains('board-card-editable')).toBe(false);
	});

	it('hides empty values when asked, but keeps false, 0 and the title', () => {
		const app = App.createConfigured__({ files: { 'projects/Sprint.md': '' } });
		const file = app.vault.getFileByPath('projects/Sprint.md');
		expect(file).not.toBeNull();
		if (!file) return;

		Services.app = {
			renderContext: MockRenderContext.create__(app).asOriginalType__(),
		} as unknown as ObsidianApp;
		const entry = BasesEntry.create__({}, file);
		entry.setValue__('file.name', StringValue.create__('').asOriginalType__());
		entry.setValue__('note.missing', NullValue.create__().asOriginalType__());
		entry.setValue__('note.blank', StringValue.create__('  ').asOriginalType__());
		entry.setValue__('note.done', BooleanValue.create__(false).asOriginalType__());
		entry.setValue__('note.count', NumberValue.create__(0).asOriginalType__());
		const render = (options: { hideEmptyProperties: boolean }, id: BasesPropertyId) =>
			new PropertyView({ options }).render(entry.asOriginalType__(), id);

		for (const id of ['note.missing', 'note.blank'] as const) {
			expect(render({ hideEmptyProperties: true }, id)).toBeNull();
			expect(render({ hideEmptyProperties: false }, id)).not.toBeNull();
		}
		for (const id of ['note.done', 'note.count', 'file.name'] as const) {
			expect(render({ hideEmptyProperties: true }, id)).not.toBeNull();
		}
	});
});
