import { PropertyManager } from 'Data/PropertyManager';
import { App } from 'obsidian';
import { ManualOrderWriter } from 'Views/ManualOrderWriter';
import BoardViewPlugin from '../main';
import { BoardViewSettings } from './Settings';

class Services {
	declare public settings: BoardViewSettings;
	declare public plugin: BoardViewPlugin;
	declare public app: App;
	declare public propertyManager: PropertyManager;
	declare public manualOrderWriter: ManualOrderWriter;

	public initialize(plugin: BoardViewPlugin) {
		this.plugin = plugin;
		this.app = plugin.app;
		this.settings = plugin.settings;
		this.propertyManager = new PropertyManager();
		this.manualOrderWriter = new ManualOrderWriter();
	}
}

export default new Services();
