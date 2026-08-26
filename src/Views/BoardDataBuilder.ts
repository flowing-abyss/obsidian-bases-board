import Services from 'Base/Services';
import { BasesEntry, BasesPropertyId, BasesQueryResult, BasesViewConfig } from 'obsidian';
import { getPropertyKeyFromId } from 'Utils';
import { EMPTY_GROUP_ID, EMPTY_GROUP_LABEL } from './BoardConstants';
import { BoardColumn, BoardItem, BoardRow, BoardViewData } from './BoardView';
import { BoardOptions } from './OptionsExtractor';

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
		this.populateItems(
			entries,
			groupPropertyId,
			subGroupPropertyId,
			hiddenGroups,
			hiddenSubGroups,
			items,
		);
		this.calculateCounts(columns, rows, items);

		return {
			groupPropertyId: groupPropertyId || '',
			subGroupPropertyId,
			columns,
			rows,
			items,
			cardOptions: options,
			cardProperties: this.config.getOrder(),
			columnColors: Services.settings.columnColors || {},
			collapsedSubGroups: [],
		};
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
		const propertyKey = getPropertyKeyFromId(propertyId);
		return Services.app.metadataCache.getFileCache(entry.file)?.frontmatter?.[propertyKey];
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
		entries: BasesEntry[],
		groupPropertyId: BasesPropertyId | null | undefined,
		subGroupPropertyId: BasesPropertyId | null | undefined,
		hiddenGroups: Set<string>,
		hiddenSubGroups: Set<string>,
		items: Record<string, Record<string, BoardItem[]>>,
	): void {
		for (const entry of entries) {
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
