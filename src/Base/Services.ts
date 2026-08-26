import { PropertyManager } from 'Data/PropertyManager';
import { App } from 'obsidian';
import BoardViewPlugin from '../main';
import { BoardViewSettings } from './Settings';

class Services {
	declare public settings: BoardViewSettings;
	declare public plugin: BoardViewPlugin;
	declare public app: App;
	declare public propertyManager: PropertyManager;

	public initialize(plugin: BoardViewPlugin) {
		this.plugin = plugin;
		this.app = plugin.app;
		this.settings = plugin.settings;
		this.propertyManager = new PropertyManager();
	}
}

export default new Services();
