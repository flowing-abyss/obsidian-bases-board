import type { App as ObsidianApp, TFile } from 'obsidian';
import { App } from 'obsidian-test-mocks/obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Services from '../src/Base/Services';
import type { PropertyManager } from '../src/Data/PropertyManager';
import { hasListEditor, renderPropertyEditor } from '../src/Views/PropertyEditor';

interface WidgetContext {
	key: string;
	sourcePath: string;
	hoverSource: string;
	blur: () => void;
	onChange: (value: unknown) => void;
}

const mockApp = App.createConfigured__({ files: { 'sources/Note.md': '' } });
const mockFile = mockApp.vault.getFileByPath('sources/Note.md');
if (!mockFile) throw new Error('Missing test note');
const file = mockFile.asOriginalType2__();
const updateFrontmatter = vi.fn((_file: TFile, _key: string, _value: unknown) => Promise.resolve());
let rendered: { value: unknown; ctx: WidgetContext } | null = null;

const widget = {
	type: 'multitext',
	validate: () => true,
	render: (el: HTMLElement, value: unknown, ctx: WidgetContext) => {
		rendered = { value, ctx };
		el.createDiv({ cls: 'multi-select-container' }).createEl('input');
	},
};

function setFrontmatter(frontmatter: Record<string, unknown>): void {
	Services.app = {
		metadataTypeManager: {
			getTypeInfo: () => ({ expected: widget, inferred: widget }),
		},
		metadataCache: { getFileCache: () => ({ frontmatter }) },
	} as unknown as ObsidianApp;
}

beforeEach(() => {
	rendered = null;
	updateFrontmatter.mockClear();
	Services.propertyManager = { updateFrontmatter } as unknown as PropertyManager;
	setFrontmatter({ category: ['[[history]]'] });
});

describe('renderPropertyEditor', () => {
	it("renders Obsidian's widget with the note's raw frontmatter value", () => {
		const el = createDiv();

		expect(renderPropertyEditor(el, file, 'category')).not.toBeNull();
		expect(el.querySelector('.multi-select-container')).not.toBeNull();
		expect(rendered?.value).toEqual(['[[history]]']);
		expect(rendered?.ctx.key).toBe('category');
		expect(rendered?.ctx.sourcePath).toBe('sources/Note.md');
		expect(rendered?.ctx.hoverSource).toBe('bases');
		expect(el.dataset.propertyType).toBe('multitext');
	});

	it('edits the key the note uses, whatever its case', () => {
		setFrontmatter({ Status: 'done' });
		renderPropertyEditor(createDiv(), file, 'status');

		expect(rendered?.value).toBe('done');
		rendered?.ctx.onChange('doing');
		expect(updateFrontmatter).toHaveBeenCalledWith(file, 'Status', 'doing');
	});

	it('clears a value to an empty key like the Properties view', () => {
		setFrontmatter({ status: 'done', tags: ['a'] });
		renderPropertyEditor(createDiv(), file, 'status');
		rendered?.ctx.onChange('');
		renderPropertyEditor(createDiv(), file, 'tags');
		rendered?.ctx.onChange([]);

		expect(updateFrontmatter.mock.calls).toEqual([
			[file, 'status', null],
			[file, 'tags', null],
		]);
	});

	it('ends the edit when the widget asks to blur', () => {
		const el = document.body.createDiv();
		const onBlur = vi.fn();
		renderPropertyEditor(el, file, 'category', { onBlur });
		const input = el.querySelector('input');
		input?.focus();
		expect(document.activeElement).toBe(input);

		rendered?.ctx.blur();
		expect(document.activeElement).not.toBe(input);
		expect(onBlur).toHaveBeenCalledTimes(1);
		el.remove();
	});

	it('reports a failed write and lets the same value be saved again', async () => {
		updateFrontmatter.mockRejectedValueOnce(new Error('Malformed YAML'));
		const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const onSave = vi.fn();
		const onSaveFailed = vi.fn();
		renderPropertyEditor(createDiv(), file, 'category', { onSave, onSaveFailed });

		rendered?.ctx.onChange(['[[physics]]']);
		expect(onSave).toHaveBeenCalledTimes(1);
		await vi.waitFor(() => expect(onSaveFailed).toHaveBeenCalledTimes(1));

		rendered?.ctx.onChange(['[[physics]]']);
		expect(updateFrontmatter).toHaveBeenCalledTimes(2);
		logged.mockRestore();
	});

	it('writes changed values to the note and skips no-op changes', () => {
		renderPropertyEditor(createDiv(), file, 'category');
		const onChange = rendered?.ctx.onChange;

		onChange?.(['[[history]]']);
		expect(updateFrontmatter).not.toHaveBeenCalled();

		onChange?.(['[[history]]', '[[philosophy]]']);
		onChange?.(['[[history]]']);
		expect(updateFrontmatter.mock.calls).toEqual([
			[file, 'category', ['[[history]]', '[[philosophy]]']],
			[file, 'category', ['[[history]]']],
		]);
	});

	it('does not add an empty key when an empty field loses focus', () => {
		setFrontmatter({});
		renderPropertyEditor(createDiv(), file, 'scientificity');

		expect(rendered?.value).toBeNull();
		rendered?.ctx.onChange('');
		rendered?.ctx.onChange([]);
		expect(updateFrontmatter).not.toHaveBeenCalled();
	});

	it('tells lists apart from single values', () => {
		expect(hasListEditor(file, 'category')).toBe(true);
		const text = { ...widget, type: 'text' };
		Services.app = {
			metadataTypeManager: { getTypeInfo: () => ({ expected: text, inferred: text }) },
			metadataCache: { getFileCache: () => ({ frontmatter: { status: 'done' } }) },
		} as unknown as ObsidianApp;
		expect(hasListEditor(file, 'status')).toBe(false);
	});

	it('lets the caller fall back when the widget API is unavailable', () => {
		Services.app = { metadataCache: { getFileCache: () => null } } as unknown as ObsidianApp;
		const el = createDiv();

		expect(renderPropertyEditor(el, file, 'category')).toBeNull();
		expect(el.childElementCount).toBe(0);
	});
});
