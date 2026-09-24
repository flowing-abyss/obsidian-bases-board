import Services from 'Base/Services';
import {
	BasesEntry,
	BasesPropertyId,
	BasesQueryResult,
	BasesSortConfig,
	BasesViewConfig,
} from 'obsidian';
import { findFrontmatterKey, getPropertyKeyFromId } from 'Utils';
import { compareEntries } from './BasesSort';
import { EMPTY_GROUP_ID, EMPTY_GROUP_LABEL } from './BoardConstants';
import { BoardColumn, BoardItem, BoardRow, BoardViewData } from './BoardView';
import { BoardOptions } from './OptionsExtractor';

interface DropSort {
	keys: BasesSortConfig[]; // the view's sort without group keys
	resort: boolean; // whether ranks must be recomputed from `keys`
}

export class BoardViewDataBuilder {
	constructor(
		private data: BasesQueryResult,
		private config: BasesViewConfig,
	) {}

	build(options: BoardOptions): BoardViewData {
		const items: Record<string, Record<string, BoardItem[]>> = {};
		const columns: BoardColumn[] = [];
		const rows: BoardRow[] = [];
		const groupPropertyId = options.groupProperty;
		const subGroupPropertyId = options.subGroupProperty;
		const hiddenGroups = new Set(options.hiddenGroups || []);
		const hiddenSubGroups = new Set(options.hiddenSubGroups || []);
		const entries = this.data?.data || [];
		if (!groupPropertyId) hiddenGroups.delete(EMPTY_GROUP_ID);
		const groupValues = this.collectPropertyValues(entries, groupPropertyId);
		const subGroupValues = subGroupPropertyId
			? this.collectPropertyValues(entries, subGroupPropertyId)
			: new Map<string, unknown>();

		this.addEmptyValues(
			groupValues,
			groupPropertyId,
			options.hideEmptyGroups,
			options.groupOrder,
		);
		if (subGroupPropertyId) {
			this.addEmptyValues(
				subGroupValues,
				subGroupPropertyId,
				options.hideEmptySubGroups,
				options.subGroupOrder,
			);
		}
		this.createColumns(groupValues, hiddenGroups, options, columns, items);
		this.createRows(subGroupValues, hiddenSubGroups, options, rows);
		const dropSort = this.getDropSort(groupPropertyId, subGroupPropertyId);
		this.populateItems(
			this.getRankedEntries(entries, dropSort),
			groupPropertyId,
			subGroupPropertyId,
			hiddenGroups,
			hiddenSubGroups,
			items,
		);
		this.calculateCounts(columns, rows, items);
		const cardProperties = this.config.getOrder();

		return {
			groupPropertyId: groupPropertyId || '',
			subGroupPropertyId,
			columns,
			rows,
			items,
			cardOptions: options,
			cardProperties,
			cardPropertyLabels: Object.fromEntries(
				cardProperties.map((id) => [id, this.getPropertyLabel(id)]),
			),
			columnColors: Services.settings.columnColors || {},
			collapsedSubGroups: [],
			dropPlacement: this.getDropPlacement(dropSort),
		};
	}

	private getPropertyLabel(id: BasesPropertyId): string {
		const key = getPropertyKeyFromId(id);
		const name = this.config.getDisplayName(id) || key;
		// A Bases display name can be a bare emoji, so keep the property recognizable
		return name.toLowerCase().includes(key.toLowerCase()) ? name : `${name} (${key})`;
	}

	// All cards of a cell share its group values, so those keys never order a drop
	private getDropSort(
		groupPropertyId: BasesPropertyId | null | undefined,
		subGroupPropertyId: BasesPropertyId | null | undefined,
	): DropSort {
		const sort = this.config.getSort();
		const isGroupKey = ({ property }: BasesSortConfig) =>
			property === groupPropertyId || property === subGroupPropertyId;
		const keys = sort.filter((key) => !isGroupKey(key));
		const firstGroupKey = sort.findIndex(isGroupKey);
		// Bases order still ranks cards across cells unless a group key decides first
		return { keys, resort: firstGroupKey !== -1 && keys.length > firstGroupKey };
	}

	// Pairs entries with their rank in the order that places a dropped card
	private getRankedEntries(entries: BasesEntry[], dropSort: DropSort): [number, BasesEntry][] {
		const ranked = [...entries.entries()];
		if (!dropSort.resort) return ranked;
		const order = [...ranked]
			.sort(([i, a], [j, b]) => compareEntries(a, b, dropSort.keys) || i - j)
			.map(([index]) => index);
		const ranks = new Map(order.map((index, rank) => [index, rank]));
		return ranked.map(([index, entry]) => [ranks.get(index) ?? index, entry]);
	}

	// A drop writes to the note, which makes it the most recently modified one
	private getDropPlacement(dropSort: DropSort): BoardViewData['dropPlacement'] {
		const [primary] = dropSort.keys;
		if (primary?.property !== 'file.mtime') return 'sorted';
		return primary.direction === 'DESC' ? 'first' : 'last';
	}

	private collectPropertyValues(
		entries: BasesEntry[],
		propertyId: BasesPropertyId | null | undefined,
	): Map<string, unknown> {
		const values = new Map<string, unknown>();
		for (const entry of entries) {
			const { id, rawValue } = this.getEntryGroupValue(entry, propertyId);
			if (!values.has(id)) {
				values.set(id, rawValue);
			}
		}
		return values;
	}

	private getEntryGroupValue(
		entry: BasesEntry,
		propertyId: BasesPropertyId | null | undefined,
	): { id: string; rawValue: unknown } {
		if (!propertyId) {
			return { id: EMPTY_GROUP_ID, rawValue: null };
		}
		const value = entry.getValue(propertyId);
		if (!value?.isTruthy()) {
			return { id: EMPTY_GROUP_ID, rawValue: null };
		}
		const id = value.toString();
		const rawValue = this.getRawNoteValue(entry, propertyId) ?? id;
		return { id, rawValue };
	}

	private getRawNoteValue(entry: BasesEntry, propertyId: BasesPropertyId): unknown {
		if (!propertyId.startsWith('note.')) return undefined;
		const frontmatter = Services.app.metadataCache.getFileCache(entry.file)?.frontmatter;
		return frontmatter?.[findFrontmatterKey(frontmatter, getPropertyKeyFromId(propertyId))];
	}

	private addEmptyValues(
		values: Map<string, unknown>,
		propertyId: BasesPropertyId | null | undefined,
		hideEmpty: boolean | undefined,
		order: string[] | undefined,
	): void {
		if (!propertyId) {
			if (!values.has(EMPTY_GROUP_ID)) values.set(EMPTY_GROUP_ID, null);
			return;
		}
		if (hideEmpty) return;
		for (const value of order ?? []) {
			if (!values.has(value)) values.set(value, value);
		}
		if (!values.has(EMPTY_GROUP_ID)) values.set(EMPTY_GROUP_ID, null);
	}

	private createColumns(
		values: Map<string, unknown>,
		hiddenGroups: Set<string>,
		options: BoardOptions,
		columns: BoardColumn[],
		items: Record<string, Record<string, BoardItem[]>>,
	): void {
		for (const key of this.sortGroups([...values.keys()], options.groupOrder)) {
			if (!hiddenGroups.has(key)) {
				columns.push({
					id: key,
					title:
						options.groupLabels?.[key] ||
						(key === EMPTY_GROUP_ID ? EMPTY_GROUP_LABEL : key),
					rawValue: values.get(key),
					count: 0,
				});
				items[key] = {};
			}
		}
	}

	private createRows(
		values: Map<string, unknown>,
		hiddenGroups: Set<string>,
		options: BoardOptions,
		rows: BoardRow[],
	): void {
		for (const key of this.sortGroups([...values.keys()], options.subGroupOrder)) {
			if (!hiddenGroups.has(key)) {
				rows.push({
					id: key,
					title:
						options.subGroupLabels?.[key] ||
						(key === EMPTY_GROUP_ID ? EMPTY_GROUP_LABEL : key),
					rawValue: values.get(key),
					count: 0,
				});
			}
		}
	}

	private populateItems(
		entries: [number, BasesEntry][],
		groupPropertyId: BasesPropertyId | null | undefined,
		subGroupPropertyId: BasesPropertyId | null | undefined,
		hiddenGroups: Set<string>,
		hiddenSubGroups: Set<string>,
		items: Record<string, Record<string, BoardItem[]>>,
	): void {
		for (const [rank, entry] of entries) {
			const groupId = this.getEntryGroupValue(entry, groupPropertyId).id;
			const subGroupId = subGroupPropertyId
				? this.getEntryGroupValue(entry, subGroupPropertyId).id
				: 'default';
			if (hiddenGroups.has(groupId)) continue;
			if (subGroupPropertyId && hiddenSubGroups.has(subGroupId)) continue;
			items[groupId] ??= {};
			const groupItems = items[groupId];
			groupItems[subGroupId] ??= [];
			groupItems[subGroupId].push({
				id: entry.file.path,
				groupId,
				subGroupId: subGroupId === 'default' ? undefined : subGroupId,
				rank,
				data: entry,
			});
		}
	}

	private calculateCounts(
		columns: BoardColumn[],
		rows: BoardRow[],
		items: Record<string, Record<string, BoardItem[]>>,
	): void {
		for (const column of columns) {
			column.count = Object.values(items[column.id] ?? {}).reduce(
				(count, groupItems) => count + groupItems.length,
				0,
			);
		}
		for (const row of rows) {
			row.count = columns.reduce(
				(count, column) => count + (items[column.id]?.[row.id]?.length ?? 0),
				0,
			);
		}
	}

	private sortGroups(groups: string[], orderList: string[] | undefined): string[] {
		if (!orderList || orderList.length === 0) {
			return groups.sort((a, b) => a.localeCompare(b));
		}
		const groupSet = new Set(groups);
		const orderSet = new Set(orderList);
		const ordered = [...orderSet].filter((group) => groupSet.has(group));
		const remaining = groups
			.filter((group) => !orderSet.has(group))
			.sort((a, b) => a.localeCompare(b));
		return [...ordered, ...remaining];
	}
}
