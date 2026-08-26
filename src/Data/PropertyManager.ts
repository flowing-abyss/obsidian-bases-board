import Services from 'Base/Services';
import { TFile } from 'obsidian';

export class PropertyManager {
	getFile(file: string): TFile | null {
		return Services.app.vault.getFileByPath(file);
	}

	async updateFrontmatter(file: TFile, key: string, value: unknown) {
		await this.updateFrontmatterValues(file, { [key]: value });
	}

	async updateFrontmatterValues(file: TFile, values: Readonly<Record<string, unknown>>) {
		await Services.app.fileManager.processFrontMatter(file, (fm) => {
			Object.assign(fm, values);
		});
	}
}
