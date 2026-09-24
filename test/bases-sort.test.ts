import type { BasesEntry as ObsidianEntry, Value as ObsidianValue } from 'obsidian';
import {
	App,
	BasesEntry,
	BooleanValue,
	LinkValue,
	NullValue,
	NumberValue,
	StringValue,
} from 'obsidian-test-mocks/obsidian';
import { describe, expect, it } from 'vitest';
import { compareEntries } from '../src/Views/BasesSort';

const app = App.createConfigured__({ files: { 'note.md': '' } });
const noteFile = app.vault.getFileByPath('note.md');
if (!noteFile) throw new Error('Missing test note');
const file = noteFile;

function entry(value: ObsidianValue | null): ObsidianEntry {
	const mock = BasesEntry.create__({}, file);
	if (value) mock.setValue__('note.key', value);
	return mock.asOriginalType__();
}

function sortValues(values: (ObsidianValue | null)[], direction: 'ASC' | 'DESC'): string[] {
	return values
		.map(entry)
		.sort((a, b) => compareEntries(a, b, [{ property: 'note.key', direction }]))
		.map((sorted) => sorted.getValue('note.key')?.toString() ?? 'missing');
}

describe('compareEntries', () => {
	it('orders numbers by size and text in natural order', () => {
		const numbers = [10, 9, 100].map((n) => NumberValue.create__(n).asOriginalType__());
		expect(sortValues(numbers, 'ASC')).toEqual(['9', '10', '100']);

		const text = ['item 10', 'Item 2', 'item 1'].map((t) =>
			StringValue.create__(t).asOriginalType__(),
		);
		expect(sortValues(text, 'DESC')).toEqual(['item 10', 'Item 2', 'item 1']);
	});

	it('puts missing values last in either direction', () => {
		const values = [
			null,
			StringValue.create__('b').asOriginalType__(),
			NullValue.create__().asOriginalType__(),
			StringValue.create__('a').asOriginalType__(),
		];
		expect(sortValues(values, 'ASC').slice(0, 2)).toEqual(['a', 'b']);
		expect(sortValues(values, 'DESC').slice(0, 2)).toEqual(['b', 'a']);
	});

	it('orders booleans by truth and links by the text they show', () => {
		const booleans = [true, false].map((b) => BooleanValue.create__(b).asOriginalType__());
		expect(sortValues(booleans, 'ASC')).toEqual(['false', 'true']);

		const links = ['[[z|Alpha]]', '[[a|Beta]]'].map((link) =>
			LinkValue.create2__(app, link, 'note.md').asOriginalType5__(),
		);
		expect(sortValues(links, 'ASC')).toEqual(['[[z|Alpha]]', '[[a|Beta]]']);
	});

	it('treats values that cannot be read as equal', () => {
		const looping = entry(null);
		looping.getValue = () => {
			throw new Error('Formula has an infinite loop');
		};
		const sort = [{ property: 'note.key' as const, direction: 'ASC' as const }];

		expect(compareEntries(looping, entry(null), sort)).toBe(0);
	});
});
