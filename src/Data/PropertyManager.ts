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

	async updateFrontmatterValues(file: TFile, values: Readonly<Record<string, unknown>>) {
		await Services.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			for (const [key, value] of Object.entries(values)) {
				fm[findFrontmatterKey(fm, key)] = value;
			}
		});
	}
}
