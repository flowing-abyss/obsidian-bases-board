import { PropertyManager } from 'Data/PropertyManager';
import { App } from 'obsidian';
import BoardViewPlugin from '../main';
import { BoardViewSettings } from './Settings';

export default class Services {
	// eslint-disable-next-line sonarjs/public-static-readonly
	public static settings: BoardViewSettings;
	// eslint-disable-next-line sonarjs/public-static-readonly
	public static plugin: BoardViewPlugin;
	// eslint-disable-next-line sonarjs/public-static-readonly
	public static app: App;
	// eslint-disable-next-line sonarjs/public-static-readonly
	public static propertyManager: PropertyManager;

	public static initialize(plugin: BoardViewPlugin) {
		this.plugin = plugin;
		this.app = plugin.app;
		this.settings = plugin.settings;
		this.propertyManager = new PropertyManager();
	}
}
