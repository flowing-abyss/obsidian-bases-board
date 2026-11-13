import Services from 'Base/Services';
import { TFile } from 'obsidian';
import { findFrontmatterKey } from 'Utils';

export class PropertyManager {
	getFile(file: string): TFile | null {
		return Services.app.vault.getFileByPath(file);
	}

	async updateFrontmatter(file: TFile, key: string, value: unknown) {
		await this.updateFrontmatterValues(file, { [key]: value });
	}

	// The value as the note stores it, from the metadata cache
	getFrontmatterValue(path: string, key: string): unknown {
		const file = this.getFile(path);
		const frontmatter = file && Services.app.metadataCache.getFileCache(file)?.frontmatter;
		return frontmatter?.[findFrontmatterKey(frontmatter, key)];
	}

	// `check` may throw to cancel the write before anything changes
	async updateFrontmatterValues(
		file: TFile,
		values: Readonly<Record<string, unknown>>,
		check?: (frontmatter: Readonly<Record<string, unknown>>) => void,
	) {
		await Services.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			check?.(fm);
			for (const [key, value] of Object.entries(values)) {
				fm[findFrontmatterKey(fm, key)] = value;
			}
		});
	}
}
