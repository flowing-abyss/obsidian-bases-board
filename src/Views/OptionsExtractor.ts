import { BasesPropertyId, BasesViewConfig } from 'obsidian';
import Services from '../Base/Services';
import { EMPTY_GROUP_ID, LEGACY_EMPTY_GROUP_VALUE } from './BoardConstants';

export const BoardOptionKeys = {
	GROUP_PROPERTY: 'groupProperty',
	SUB_GROUP_PROPERTY: 'subGroupProperty',
	IMAGE_PROPERTY: 'imageProperty',
	ICON_PROPERTY: 'iconProperty',
	ID_PROPERTY: 'idProperty',
	GROUP_ORDER: 'groupOrder',
	SUB_GROUP_ORDER: 'subGroupOrder',
	GROUP_LABELS: 'groupLabels',
	SUB_GROUP_LABELS: 'subGroupLabels',
	HIDE_EMPTY_GROUPS: 'hideEmptyGroups',
	HIDE_EMPTY_SUB_GROUPS: 'hideEmptySubGroups',
	CARD_SIZE: 'cardSize',
	HIDDEN_GROUPS: 'hiddenGroups',
	HIDDEN_SUB_GROUPS: 'hiddenSubGroups',
	COLLAPSED_SUB_GROUPS: 'collapsedSubGroups',
	HIDE_IMAGE_PLACEHOLDER: 'hideImagePlaceholder',
	HIDE_EMPTY_PROPERTIES: 'hideEmptyProperties',
	NEW_NOTE_FOLDER: 'newNoteFolder',
	NEW_NOTE_TEMPLATE: 'newNoteTemplate',
	NEW_NOTE_OPEN: 'newNoteOpen',

	// Icon mapping
	ICON_MAPPING: 'iconMapping',

	// Color Options (simplified)
	COLOR_HEADERS: 'colorHeaders',
	COLOR_CELLS: 'colorCells',
	COLOR_CARDS: 'colorCards',
} as const;

export interface BoardOptions {
	groupProperty?: BasesPropertyId | null;
	subGroupProperty?: BasesPropertyId | null;
	imageProperty?: BasesPropertyId | null;
	iconProperty?: BasesPropertyId | null;
	idProperty?: BasesPropertyId | null;
	groupOrder?: string[];
	subGroupOrder?: string[];
	groupLabels?: Record<string, string>;
	subGroupLabels?: Record<string, string>;
	hideEmptyGroups?: boolean;
	hideEmptySubGroups?: boolean;
	cardSize?: 'small' | 'medium' | 'large';
	hiddenGroups?: string[];
	hiddenSubGroups?: string[];
	collapsedSubGroups?: string[];
	hideImagePlaceholder?: boolean;
	hideEmptyProperties?: boolean;
	newNoteFolder?: string;
	newNoteTemplate?: string;
	newNoteOpen?: boolean;

	// Icon mapping: property value → lucide icon name
	iconMapping?: Record<string, string>;

	// Color Options
	colorHeaders?: boolean;
	colorCells?: boolean;
	colorCards?: boolean; // minimal mode only (left border)
}

function normalizeGroupId(value: string): string {
	return value === LEGACY_EMPTY_GROUP_VALUE ? EMPTY_GROUP_ID : value;
}

function readStringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string')
		: [];
}

function readGroupArray(value: unknown): string[] {
	return readStringArray(value).map(normalizeGroupId);
}

function readBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === 'boolean' ? value : fallback;
}

function readPropertyId(value: unknown): BasesPropertyId | null {
	return typeof value === 'string' && value.length > 0 ? (value as BasesPropertyId) : null;
}

function readCardSize(value: unknown): 'small' | 'medium' | 'large' {
	return value === 'small' || value === 'large' || value === 'medium' ? value : 'medium';
}

function parseLabels(entries: string[]): Record<string, string> {
	const result: Record<string, string> = {};
	for (const entry of entries) {
		const sep = entry.indexOf('=');
		if (sep > 0) {
			result[normalizeGroupId(entry.slice(0, sep).trim())] = entry.slice(sep + 1).trim();
		}
	}
	return result;
}

export class OptionsExtractor {
	constructor(private config: BasesViewConfig) {}

	extract(): BoardOptions {
		const options: BoardOptions = {};
		let groupProperty = readPropertyId(this.config.get(BoardOptionKeys.GROUP_PROPERTY));
		let subGroupProperty = readPropertyId(this.config.get(BoardOptionKeys.SUB_GROUP_PROPERTY));

		// Validate group property is still eligible
		if (groupProperty) {
			if (!Services.plugin.isPropertyEligibleForGrouping(groupProperty)) {
				console.warn(
					`Group property '${groupProperty}' is no longer eligible for grouping. Clearing it.`,
				);
				this.config.set(BoardOptionKeys.GROUP_PROPERTY, null);
				groupProperty = null;
			}
		}

		// Validate subgroup property is still eligible
		if (subGroupProperty) {
			if (!Services.plugin.isPropertyEligibleForGrouping(subGroupProperty)) {
				console.warn(
					`Sub-group property '${subGroupProperty}' is no longer eligible for grouping. Clearing it.`,
				);
				this.config.set(BoardOptionKeys.SUB_GROUP_PROPERTY, null);
				subGroupProperty = null;
			}
		}

		options.groupProperty = groupProperty;
		options.subGroupProperty = subGroupProperty;
		options.imageProperty = readPropertyId(this.config.get(BoardOptionKeys.IMAGE_PROPERTY));
		options.iconProperty = readPropertyId(this.config.get(BoardOptionKeys.ICON_PROPERTY));
		options.idProperty = readPropertyId(this.config.get(BoardOptionKeys.ID_PROPERTY));
		options.groupOrder = readGroupArray(this.config.get(BoardOptionKeys.GROUP_ORDER));
		options.subGroupOrder = readGroupArray(this.config.get(BoardOptionKeys.SUB_GROUP_ORDER));
		options.groupLabels = parseLabels(
			readStringArray(this.config.get(BoardOptionKeys.GROUP_LABELS)),
		);
		options.subGroupLabels = parseLabels(
			readStringArray(this.config.get(BoardOptionKeys.SUB_GROUP_LABELS)),
		);
		options.hideEmptyGroups = readBoolean(
			this.config.get(BoardOptionKeys.HIDE_EMPTY_GROUPS),
			false,
		);
		options.hideEmptySubGroups = readBoolean(
			this.config.get(BoardOptionKeys.HIDE_EMPTY_SUB_GROUPS),
			false,
		);
		options.cardSize = readCardSize(this.config.get(BoardOptionKeys.CARD_SIZE));
		options.hiddenGroups = readGroupArray(this.config.get(BoardOptionKeys.HIDDEN_GROUPS));
		options.hiddenSubGroups = readGroupArray(
			this.config.get(BoardOptionKeys.HIDDEN_SUB_GROUPS),
		);
		options.collapsedSubGroups = readGroupArray(
			this.config.get(BoardOptionKeys.COLLAPSED_SUB_GROUPS),
		);
		options.hideImagePlaceholder = readBoolean(
			this.config.get(BoardOptionKeys.HIDE_IMAGE_PLACEHOLDER),
			true,
		);
		options.hideEmptyProperties = readBoolean(
			this.config.get(BoardOptionKeys.HIDE_EMPTY_PROPERTIES),
			false,
		);
		options.newNoteFolder =
			readStringArray(this.config.get(BoardOptionKeys.NEW_NOTE_FOLDER))[0] ?? '';
		options.newNoteTemplate =
			readStringArray(this.config.get(BoardOptionKeys.NEW_NOTE_TEMPLATE))[0] ?? '';
		options.newNoteOpen = readBoolean(this.config.get(BoardOptionKeys.NEW_NOTE_OPEN), false);

		options.iconMapping = parseLabels(
			readStringArray(this.config.get(BoardOptionKeys.ICON_MAPPING)),
		);

		// Color Options
		options.colorHeaders = readBoolean(this.config.get(BoardOptionKeys.COLOR_HEADERS), true);
		options.colorCells = readBoolean(this.config.get(BoardOptionKeys.COLOR_CELLS), false);
		options.colorCards = readBoolean(this.config.get(BoardOptionKeys.COLOR_CARDS), true);

		return options;
	}
}
