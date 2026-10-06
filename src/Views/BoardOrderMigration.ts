import { parser } from '@lezer/markdown';
import { getFrontMatterInfo, parseYaml } from 'obsidian';

const ORDER_KEYS = {
	groupOrder: 'columnOrder',
	subGroupOrder: 'rowOrder',
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function renamedConfig(value: unknown): unknown {
	if (!isRecord(value) || !Array.isArray(value.views)) return value;
	return {
		...value,
		views: value.views.map((view: unknown) => {
			if (!isRecord(view) || view.type !== 'board-view') return view;
			const result = { ...view };
			for (const [oldKey, newKey] of Object.entries(ORDER_KEYS)) {
				// With native grouping configured, groupOrder is a filter owned by
				// Obsidian. It cannot safely be interpreted as a Board column order.
				if (oldKey === 'groupOrder' && result.groupBy != null) continue;
				if (!(newKey in result) && Array.isArray(result[oldKey])) {
					result[newKey] = result[oldKey];
					delete result[oldKey];
				}
			}
			return result;
		}),
	};
}

// Compare YAML values independently of the order of mapping keys.
function fingerprint(value: unknown): string | undefined {
	return JSON.stringify(value, (_key: string, item: unknown) =>
		isRecord(item)
			? Object.fromEntries(
					Object.keys(item)
						.sort((a, b) => a.localeCompare(b))
						.map((key) => [key, item[key]]),
				)
			: item,
	);
}

interface SourceEdit {
	from: number;
	to: number;
	text: string;
}

function hasLegacyOrders(source: string): boolean {
	return source.includes('board-view') && /\b(?:groupOrder|subGroupOrder)\b/.test(source);
}

function renameBoardOrders(source: string): { source: string; edits: SourceEdit[] } {
	const edits: SourceEdit[] = [];
	if (!hasLegacyOrders(source)) return { source, edits };
	try {
		const original: unknown = parseYaml(source);
		const expected = fingerprint(renamedConfig(original));
		let current = fingerprint(original);
		if (current === expected) return { source, edits };

		// Check each candidate against the parsed document: similarly named keys in
		// other views, comments, formulas and quoted values must never be changed.
		// Reverse offsets stay valid as later replacements change the source length.
		const candidates = [...source.matchAll(/\b(groupOrder|subGroupOrder)\b/g)].reverse();
		for (const match of candidates) {
			const key = match[0] as keyof typeof ORDER_KEYS;
			const offset = match.index;
			const candidate =
				source.slice(0, offset) + ORDER_KEYS[key] + source.slice(offset + key.length);
			try {
				const parsed: unknown = parseYaml(candidate);
				const changed = fingerprint(parsed);
				if (changed !== current && fingerprint(renamedConfig(parsed)) === expected) {
					source = candidate;
					current = changed;
					edits.push({ from: offset, to: offset + key.length, text: ORDER_KEYS[key] });
				}
			} catch {
				// An occurrence may be part of a YAML anchor or another non-key token.
			}
		}
	} catch {
		// Leave malformed or cyclic YAML alone, including a file being edited.
	}
	return { source, edits };
}

/** Rename only Board order keys, preserving the rest of the source byte for byte. */
export function migrateBoardOrders(source: string): string {
	return renameBoardOrders(source).source;
}

interface SourceRange {
	from: number;
	to: number;
}

type MarkdownNode = ReturnType<typeof parser.parse>['topNode'];

function commentRanges(source: string, code: SourceRange[]): SourceRange[] {
	const comments: SourceRange[] = [];
	let start: number | null = null;
	let codeIndex = 0;
	for (const match of source.matchAll(/%%/g)) {
		const offset = match.index;
		if (start !== null) {
			comments.push({ from: start, to: offset + 2 });
			start = null;
			continue;
		}
		while (code[codeIndex] && code[codeIndex]!.to <= offset) codeIndex++;
		if (code[codeIndex] && code[codeIndex]!.from <= offset) continue;
		start = offset;
	}
	if (start !== null) comments.push({ from: start, to: source.length });
	return comments;
}

function codeBlockEdits(source: string, block: MarkdownNode): SourceEdit[] {
	let yaml = '';
	const parts = block.getChildren('CodeText').map((node) => {
		const from = yaml.length;
		yaml += source.slice(node.from, node.to);
		return { from, to: yaml.length, sourceFrom: node.from };
	});
	const mapped: SourceEdit[] = [];
	// CodeText excludes the final line feed before a closing fence, but may
	// retain its carriage return. Restore that terminator only for YAML parsing.
	for (const edit of renameBoardOrders(yaml + '\n').edits) {
		const part = parts.find((part) => part.from <= edit.from && edit.to <= part.to);
		if (!part) return [];
		mapped.push({
			from: part.sourceFrom + edit.from - part.from,
			to: part.sourceFrom + edit.to - part.from,
			text: edit.text,
		});
	}
	return mapped;
}

/** Parse the actual Markdown source; cached section offsets may belong to an older edit. */
export function migrateBoardCodeBlocks(source: string): string {
	if (!hasLegacyOrders(source)) return source;
	const contentStart = getFrontMatterInfo(source).contentStart;
	const content = source.slice(contentStart);
	const blocks: MarkdownNode[] = [];
	const code: SourceRange[] = [];
	parser.parse(content).iterate({
		enter(node) {
			if (!['FencedCode', 'CodeBlock', 'InlineCode'].includes(node.name)) return;
			code.push({ from: node.from, to: node.to });
			if (node.name === 'FencedCode') {
				const info = node.node.getChild('CodeInfo');
				if (info && content.slice(info.from, info.to).trim() === 'base') {
					blocks.push(node.node);
				}
			}
			return false;
		},
	});
	const comments = commentRanges(content, code);
	const edits = blocks.flatMap((block) =>
		comments.some((range) => range.from < block.to && block.from < range.to)
			? []
			: codeBlockEdits(content, block),
	);
	edits.sort((a, b) => b.from - a.from);
	for (const edit of edits) {
		source =
			source.slice(0, contentStart + edit.from) +
			edit.text +
			source.slice(contentStart + edit.to);
	}
	return source;
}
