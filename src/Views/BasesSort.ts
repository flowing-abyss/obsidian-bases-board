import {
	BasesEntry,
	BasesSortConfig,
	BooleanValue,
	DurationValue,
	LinkValue,
	NullValue,
	NumberValue,
	Value,
} from 'obsidian';

// Bases compares text in natural order, ignoring case and accents
const collator = new Intl.Collator(undefined, {
	usage: 'sort',
	sensitivity: 'base',
	numeric: true,
});
// [[path|display]]
const LINK_DISPLAY = /^\[\[[^|\]]*\|(.+)\]\]$/;

/**
 * Orders entries the way Bases sorts a view: key by key, missing values last in
 * either direction, booleans by truth, numbers and durations by size, and
 * everything else, dates in ISO form included, as text.
 */
export function compareEntries(a: BasesEntry, b: BasesEntry, sort: BasesSortConfig[]): number {
	// Like Bases, entries whose values cannot be read, such as a formula that loops,
	// count as equal rather than failing the whole board
	try {
		for (const { property, direction } of sort) {
			const result = compareValues(a.getValue(property), b.getValue(property), direction);
			if (result !== 0) return result;
		}
	} catch {
		return 0;
	}
	return 0;
}

function compareValues(a: Value | null, b: Value | null, direction: 'ASC' | 'DESC'): number {
	const aMissing = a === null || a instanceof NullValue;
	const bMissing = b === null || b instanceof NullValue;
	if (aMissing && bMissing) return 0;

	let result: number;
	if (a instanceof BooleanValue || b instanceof BooleanValue) {
		result = Number(a?.isTruthy() ?? false) - Number(b?.isTruthy() ?? false);
	} else if (aMissing) {
		return 1;
	} else if (bMissing) {
		return -1;
	} else if (a instanceof NumberValue && b instanceof NumberValue) {
		result = Number(a.toString()) - Number(b.toString()) || 0;
	} else if (a instanceof DurationValue && b instanceof DurationValue) {
		result = a.getMilliseconds() - b.getMilliseconds();
	} else {
		result = collator.compare(getSortText(a), getSortText(b));
	}
	return direction === 'ASC' ? result : -result;
}

// Bases sorts a link by the text it shows
function getSortText(value: Value): string {
	const text = value.toString();
	if (!(value instanceof LinkValue)) return text;
	return LINK_DISPLAY.exec(text)?.[1] ?? text;
}
