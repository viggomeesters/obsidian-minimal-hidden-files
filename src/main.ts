import { App, Notice, Platform, Plugin, PluginSettingTab, Setting, type Stat } from "obsidian";

declare module "obsidian" {
	interface Vault {
		getConfig(key: string): unknown;
		setConfig(key: string, value: unknown): void;
	}
}

type ReconcileDeletion = (realPath: string, vaultPath: string) => Promise<void>;

interface InternalFileSystemAdapter {
	_exists(fullPath: string, vaultPath: string): Promise<boolean>;
	getFullPath(vaultPath: string): string;
	getRealPath(vaultPath: string): string;
	listRecursive(vaultPath: string): Promise<void>;
	reconcileDeletion: ReconcileDeletion;
	reconcileFileInternal?(realPath: string, vaultPath: string): Promise<void>;
	reconcileFolderCreation(realPath: string, vaultPath: string): Promise<void>;
	stat(vaultPath: string): Promise<Stat | null>;
}

interface MinimalHiddenFilesSettings {
	showHiddenFiles: boolean;
	showSqliteSidecars: boolean;
	showUnsupportedFiles: boolean;
}

const DEFAULT_SETTINGS: MinimalHiddenFilesSettings = {
	showHiddenFiles: true,
	showSqliteSidecars: false,
	showUnsupportedFiles: true,
};

const DENIED_DOT_SEGMENTS = new Set([".trash", ".git"]);
const SQLITE_SIDECAR_SUFFIXES = [".sqlite-wal", ".sqlite-shm", ".db-wal", ".db-shm"];

function pathSegments(vaultPath: string): string[] {
	return vaultPath.split("/").filter(Boolean);
}

function isDotSegment(segment: string): boolean {
	return segment.length > 1 && segment.startsWith(".");
}

function hasDeniedSegment(vaultPath: string, configDir: string): boolean {
	return pathSegments(vaultPath).some(
		(segment) => segment === configDir || DENIED_DOT_SEGMENTS.has(segment),
	);
}

function isSqliteSidecarPath(vaultPath: string): boolean {
	const normalized = vaultPath.toLowerCase();
	return SQLITE_SIDECAR_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

function isAllowedHiddenPath(vaultPath: string, configDir: string, showSqliteSidecars: boolean): boolean {
	const segments = pathSegments(vaultPath);
	if (!segments.some(isDotSegment) || hasDeniedSegment(vaultPath, configDir)) {
		return false;
	}
	return showSqliteSidecars || !isSqliteSidecarPath(vaultPath);
}

export default class MinimalHiddenFilesPlugin extends Plugin {
	settings: MinimalHiddenFilesSettings = DEFAULT_SETTINGS;

	private originalReconcileDeletion: ReconcileDeletion | null = null;
	private previousShowUnsupportedFiles = false;
	private revealedPaths = new Set<string>();

	async onload(): Promise<void> {
		if (!Platform.isDesktopApp) {
			new Notice("Minimal Hidden Files is desktop-only.");
			return;
		}

		await this.loadSettings();
		this.previousShowUnsupportedFiles = this.getShowUnsupportedFiles();
		this.applyUnsupportedFileVisibility();

		this.app.workspace.onLayoutReady(() => {
			if (this.settings.showHiddenFiles) {
				this.enableHiddenFiles();
			}
		});

		this.addCommand({
			id: "rescan-hidden-files",
			name: "Rescan hidden files",
			callback: () => {
				void this.rescanHiddenFiles();
			},
		});

		this.addSettingTab(new MinimalHiddenFilesSettingTab(this.app, this));
	}

	onunload(): void {
		this.disableHiddenFiles()
			.catch((error) => {
				console.error("Minimal Hidden Files: failed to restore hidden file state", error);
			})
			.finally(() => {
				this.restoreUnsupportedFileVisibility();
			});
	}

	async loadSettings(): Promise<void> {
		const loaded = (await this.loadData()) as Partial<MinimalHiddenFilesSettings> | null;
		this.settings = { ...DEFAULT_SETTINGS, ...(loaded ?? {}) };
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	applyUnsupportedFileVisibility(): void {
		this.app.vault.setConfig("showUnsupportedFiles", this.settings.showUnsupportedFiles);
	}

	enableHiddenFiles(): void {
		this.patchAdapter();
	}

	async rescanHiddenFiles(): Promise<void> {
		this.patchAdapter();
		await this.adapter().listRecursive("");
		new Notice("Minimal Hidden Files rescan complete.");
	}

	async disableHiddenFiles(): Promise<void> {
		await this.hideRevealedPaths();
		this.restoreAdapter();
	}

	private getShowUnsupportedFiles(): boolean {
		return Boolean(this.app.vault.getConfig("showUnsupportedFiles"));
	}

	private restoreUnsupportedFileVisibility(): void {
		this.app.vault.setConfig("showUnsupportedFiles", this.previousShowUnsupportedFiles);
	}

	private adapter(): InternalFileSystemAdapter {
		return this.app.vault.adapter as unknown as InternalFileSystemAdapter;
	}

	private patchAdapter(): void {
		if (this.originalReconcileDeletion) {
			return;
		}

		const adapter = this.adapter();
		const originalReconcileDeletion: ReconcileDeletion = adapter.reconcileDeletion.bind(adapter);
		this.originalReconcileDeletion = originalReconcileDeletion;

		adapter.reconcileDeletion = async (realPath: string, vaultPath: string): Promise<void> => {
			if (
				!this.settings.showHiddenFiles ||
				!isAllowedHiddenPath(vaultPath, this.app.vault.configDir, this.settings.showSqliteSidecars)
			) {
				await originalReconcileDeletion(realPath, vaultPath);
				return;
			}

			const fullPath = adapter.getFullPath(vaultPath);
			if (!(await adapter._exists(fullPath, vaultPath))) {
				this.revealedPaths.delete(vaultPath);
				await originalReconcileDeletion(realPath, vaultPath);
				return;
			}

			this.revealedPaths.add(vaultPath);
			await this.revealPath(vaultPath);
		};
	}

	private restoreAdapter(): void {
		if (!this.originalReconcileDeletion) {
			return;
		}

		this.adapter().reconcileDeletion = this.originalReconcileDeletion;
		this.originalReconcileDeletion = null;
		this.revealedPaths.clear();
	}

	private async revealPath(vaultPath: string): Promise<void> {
		const adapter = this.adapter();
		const realPath = adapter.getRealPath(vaultPath);
		const pathStat = await adapter.stat(vaultPath);

		if (pathStat?.type === "folder") {
			await adapter.reconcileFolderCreation(realPath, vaultPath);
			await adapter.listRecursive(vaultPath);
			return;
		}

		if (adapter.reconcileFileInternal) {
			await adapter.reconcileFileInternal(realPath, vaultPath);
		}
	}

	private async hideRevealedPaths(): Promise<void> {
		if (!this.originalReconcileDeletion) {
			this.revealedPaths.clear();
			return;
		}

		const adapter = this.adapter();
		const paths = Array.from(this.revealedPaths).sort((a, b) => b.length - a.length);
		for (const vaultPath of paths) {
			await this.originalReconcileDeletion(adapter.getRealPath(vaultPath), vaultPath);
		}
		this.revealedPaths.clear();
	}

}

class MinimalHiddenFilesSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: MinimalHiddenFilesPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Reveal dotfiles and dotfolders")
			.setDesc("Shows allowed dot-prefixed files and folders in the native File Explorer.")
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.showHiddenFiles).onChange(async (value) => {
					this.plugin.settings.showHiddenFiles = value;
					await this.plugin.saveSettings();

					if (value) {
						this.plugin.enableHiddenFiles();
					} else {
						await this.plugin.disableHiddenFiles();
					}
				});
			});

		new Setting(containerEl)
			.setName("Reveal SQLite sidecars")
			.setDesc("Shows .sqlite-wal, .sqlite-shm, .db-wal, and .db-shm runtime files for diagnosis. Off by default.")
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.showSqliteSidecars).onChange(async (value) => {
					this.plugin.settings.showSqliteSidecars = value;
					await this.plugin.saveSettings();

					if (this.plugin.settings.showHiddenFiles) {
						await this.plugin.disableHiddenFiles();
						await this.plugin.enableHiddenFiles();
					}
				});
			});

		new Setting(containerEl)
			.setName("Show unsupported file types")
			.setDesc('Mirrors Obsidian\'s native "Detect all file extensions" setting.')
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.showUnsupportedFiles).onChange(async (value) => {
					this.plugin.settings.showUnsupportedFiles = value;
					await this.plugin.saveSettings();
					this.plugin.applyUnsupportedFileVisibility();
				});
			});

		new Setting(containerEl)
			.setName("Rescan hidden files")
			.setDesc("Manually scan the vault for hidden paths. Automatic startup rescans are skipped for performance.")
			.addButton((button) => {
				button.setButtonText("Rescan").onClick(() => {
					void this.plugin.rescanHiddenFiles();
				});
			});

		new Setting(containerEl)
			.setName("Default exclusions")
			.setDesc("The vault configuration folder, trash folder, and Git folder are always hidden. SQLite WAL/SHM sidecars are hidden unless the diagnostic toggle is enabled.");
	}
}
