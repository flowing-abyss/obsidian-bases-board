import { Plugin, TFile } from 'obsidian';
import { migrateBoardCodeBlocks, migrateBoardOrders } from '../Views/BoardOrderMigration';

const CODE_SECTIONS = new Set(['code', 'callout', 'blockquote', 'list']);

/** Migrate source before Bases parsing consumes the now-reserved groupOrder key. */
export class OrderMigration {
	private pending = new Map<TFile, Promise<void>>();
	private queued = new Set<TFile>();
	private stopped = false;

	constructor(private plugin: Plugin) {}

	async start(): Promise<void> {
		const { app } = this.plugin;
		this.plugin.register(() => {
			this.stopped = true;
		});
		const onBaseChange = (file: unknown) => {
			if (file instanceof TFile && file.extension === 'base') void this.migrate(file);
		};
		this.plugin.registerEvent(app.vault.on('create', onBaseChange));
		this.plugin.registerEvent(app.vault.on('modify', onBaseChange));
		this.plugin.registerEvent(app.vault.on('rename', onBaseChange));
		this.plugin.registerEvent(
			app.metadataCache.on('changed', (file) => {
				void this.migrate(file);
			}),
		);
		await this.migrateExisting(true);
		app.workspace.onLayoutReady(() => {
			if (!this.stopped) void this.migrateExisting();
		});
	}

	private async migrateExisting(onlyBases = false): Promise<void> {
		for (const file of this.plugin.app.vault.getFiles()) {
			if (this.stopped) return;
			if (onlyBases && file.extension !== 'base') continue;
			await this.migrate(file);
		}
	}

	private migrate(file: TFile): Promise<void> {
		if (this.stopped) return Promise.resolve();
		const running = this.pending.get(file);
		if (running) {
			this.queued.add(file);
			return running;
		}
		const task = this.migrateFile(file)
			.catch((error: unknown) => {
				console.error(
					`Bases Board: could not migrate order settings in ${file.path}`,
					error,
				);
			})
			.finally(() => {
				this.pending.delete(file);
				if (this.queued.delete(file)) void this.migrate(file);
			});
		this.pending.set(file, task);
		return task;
	}

	private async migrateFile(file: TFile): Promise<void> {
		const { vault, metadataCache } = this.plugin.app;
		const sections = metadataCache.getFileCache(file)?.sections ?? [];
		if (
			file.extension !== 'base' &&
			(file.extension !== 'md' ||
				!sections.some((section) => CODE_SECTIONS.has(section.type)))
		) {
			return;
		}
		const original = await vault.read(file);
		const migrate = (source: string) =>
			file.extension === 'base' ? migrateBoardOrders(source) : migrateBoardCodeBlocks(source);
		const migrated = migrate(original);
		if (this.stopped || migrated === original) return;
		await vault.process(file, (current) => {
			// A later cache event will retry if the user edited Markdown after the
			// read. The parser and cached result always describe the same source.
			if (this.stopped) return current;
			if (current === original) return migrated;
			return file.extension === 'md' ? current : migrate(current);
		});
	}
}
