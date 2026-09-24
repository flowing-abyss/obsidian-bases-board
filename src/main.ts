import { BoardViewSettings, DEFAULT_SETTINGS } from 'Base/Settings';
import { Plugin, QueryController } from 'obsidian';
import { BoardViewRenderer } from 'Views/BoardViewRenderer';
import { IconPickerModal } from 'Views/IconPickerModal';
import { BoardOptionKeys } from 'Views/OptionsExtractor';
import Services from './Base/Services';

export const BASES_VIEW_ID = 'board-view';

export default class BoardViewPlugin extends Plugin {
	declare settings: BoardViewSettings;

	async onload() {
		// Load settings
		await this.loadSettings();

		// Initialize services
		Services.initialize(this);

		// Icon picker command
		this.addCommand({
			id: 'browse-icons',
			name: 'Browse icons',
			callback: () => new IconPickerModal(this.app).open(),
		});

		this.registerBasesView(BASES_VIEW_ID, {
			name: 'Board',
			icon: 'columns',
			factory: (controller: QueryController, containerEl: HTMLElement) => {
				return new BoardViewRenderer(controller, containerEl);
			},
			options: () => [
				{
					type: 'group',
					displayName: 'Appearance',
					items: [
						{
							type: 'dropdown',
							displayName: 'Card size',
							key: BoardOptionKeys.CARD_SIZE,
							options: {
								small: 'Small (0.5x)',
								medium: 'Medium (0.75x)',
								large: 'Large (1x)',
							},
							default: 'medium',
							description: 'Scale the card size',
						},
						{
							type: 'property',
							displayName: 'Icon property',
							key: BoardOptionKeys.ICON_PROPERTY,
							filter: (prop: string) =>
								Services.plugin.isPropertyEligibleForGrouping(prop),
							default: '',
							description: 'Enter the property ID to display as card icon',
						},
						{
							type: 'multitext',
							displayName: 'Icon mapping',
							key: BoardOptionKeys.ICON_MAPPING,
							default: [],
							description:
								'Map property values to icon names. Format: value=icon-name (e.g. bug=bug, feature=sparkles). Use the "Bases Board: Browse icons" command to search icons.',
						},
						{
							type: 'property',
							displayName: 'ID property',
							key: BoardOptionKeys.ID_PROPERTY,
							filter: (prop: string) =>
								Services.plugin.isPropertyEligibleForGrouping(prop),
							default: '',
							description:
								'Property to show as a muted ID above the card title. Click copies it to clipboard.',
						},
						{
							type: 'toggle',
							displayName: 'Hide empty properties',
							key: BoardOptionKeys.HIDE_EMPTY_PROPERTIES,
							default: false,
							description: 'Hide properties without a value on cards',
						},
					],
				},
				{
					type: 'group',
					displayName: 'Colors',
					items: [
						{
							type: 'toggle',
							displayName: 'Color headers',
							key: BoardOptionKeys.COLOR_HEADERS,
							default: true,
							description: 'Apply color to headers (chips)',
						},
						{
							type: 'toggle',
							displayName: 'Color cells',
							key: BoardOptionKeys.COLOR_CELLS,
							default: false,
							description: 'Apply color to cells',
						},
						{
							type: 'toggle',
							displayName: 'Color cards',
							key: BoardOptionKeys.COLOR_CARDS,
							default: true,
							description: 'Apply color to cards (minimal border)',
						},
					],
				},
				{
					type: 'group',
					displayName: 'Group',
					items: [
						{
							type: 'property',
							displayName: 'Group property',
							key: BoardOptionKeys.GROUP_PROPERTY,
							filter: (prop: string) =>
								Services.plugin.isPropertyEligibleForGrouping(prop),
							default: '',
							description: 'Enter the property ID to group columns by',
						},
						{
							type: 'toggle',
							displayName: 'Hide empty groups',
							key: BoardOptionKeys.HIDE_EMPTY_GROUPS,
							default: false,
							description:
								'Hide groups with no cards. When off, groups from Group order are always shown',
						},
						{
							type: 'multitext',
							displayName: 'Hidden groups',
							key: BoardOptionKeys.HIDDEN_GROUPS,
							default: [],
							description: 'List of hidden groups',
						},
						{
							type: 'multitext',
							displayName: 'Group order',
							key: BoardOptionKeys.GROUP_ORDER,
							default: [],
							description: 'Order of main group (columns)',
						},
						{
							type: 'multitext',
							displayName: 'Group labels',
							key: BoardOptionKeys.GROUP_LABELS,
							default: [],
							description: 'Custom display names for groups, format: value=Label',
						},
					],
				},
				{
					type: 'group',
					displayName: 'Sub-group',
					items: [
						{
							type: 'property',
							displayName: 'Sub-group property',
							key: BoardOptionKeys.SUB_GROUP_PROPERTY,
							filter: (prop: string) =>
								Services.plugin.isPropertyEligibleForGrouping(prop),
							default: '',
							description: 'Enter the property ID to group rows by',
						},
						{
							type: 'toggle',
							displayName: 'Hide empty sub-groups',
							key: BoardOptionKeys.HIDE_EMPTY_SUB_GROUPS,
							default: false,
							description: 'Hide empty sub group (rows)',
						},
						{
							type: 'multitext',
							displayName: 'Hidden sub-groups',
							key: BoardOptionKeys.HIDDEN_SUB_GROUPS,
							default: [],
							description: 'List of hidden sub-groups',
						},
						{
							type: 'multitext',
							displayName: 'Sub-group order',
							key: BoardOptionKeys.SUB_GROUP_ORDER,
							default: [],
							description: 'Order of sub group (rows)',
						},
						{
							type: 'multitext',
							displayName: 'Sub-group labels',
							key: BoardOptionKeys.SUB_GROUP_LABELS,
							default: [],
							description: 'Custom display names for sub-groups, format: value=Label',
						},
					],
				},
				{
					type: 'group',
					displayName: 'Image',
					items: [
						{
							type: 'property',
							displayName: 'Image property',
							key: BoardOptionKeys.IMAGE_PROPERTY,
							filter: (prop: string) =>
								Services.plugin.isPropertyEligibleForGrouping(prop),
							default: '',
							description: 'Enter the property ID to display as card thumbnail',
						},
						{
							type: 'toggle',
							displayName: 'Hide image placeholder',
							key: BoardOptionKeys.HIDE_IMAGE_PLACEHOLDER,
							default: true,
							description: 'Hide grey placeholder if image is missing',
						},
					],
				},
				{
					type: 'group',
					displayName: 'New note',
					items: [
						{
							type: 'multitext',
							displayName: 'Folder',
							key: BoardOptionKeys.NEW_NOTE_FOLDER,
							default: [],
							description: 'Folder path for new notes (e.g. Projects/Tasks)',
						},
						{
							type: 'multitext',
							displayName: 'Template',
							key: BoardOptionKeys.NEW_NOTE_TEMPLATE,
							default: [],
							description: 'Template file path (e.g. Templates/Task.md)',
						},
						{
							type: 'toggle',
							displayName: 'Open after creation',
							key: BoardOptionKeys.NEW_NOTE_OPEN,
							default: false,
							description: 'Open the new note after creating it',
						},
					],
				},
			],
		});
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		) as BoardViewSettings;
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	isPropertyEligibleForGrouping(prop: string) {
		return !prop.startsWith('file.');
	}
}
