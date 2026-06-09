import fs from "node:fs";

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const versions = JSON.parse(fs.readFileSync("versions.json", "utf8"));
const source = fs.readFileSync("src/main.ts", "utf8");
const readme = fs.readFileSync("README.md", "utf8");

const checks = [
	[manifest.id === "minimal-hidden-files", "manifest id is minimal-hidden-files"],
	[manifest.version === packageJson.version, "manifest and package versions match"],
	[versions[manifest.version] === manifest.minAppVersion, "versions maps manifest version"],
	[source.includes("showSqliteSidecars: false"), "SQLite sidecars are hidden by default"],
	[source.includes('".sqlite-wal"') && source.includes('".sqlite-shm"'), "sqlite sidecar suffixes are listed"],
	[source.includes('".db-wal"') && source.includes('".db-shm"'), "db sidecar suffixes are listed"],
	[source.includes('new Set([".trash", ".git"])'), "trash and git hard exclusions remain"],
	[source.includes("segment === configDir"), "vault config directory hard exclusion remains"],
	[source.includes("Reveal SQLite sidecars"), "diagnostic sidecar setting exists"],
	[readme.includes(".sqlite-wal") && readme.includes(".db-shm"), "README documents SQLite sidecar policy"],
	[!source.includes("fetch(") && !source.includes("XMLHttpRequest") && !source.includes("WebSocket"), "source has no network APIs"],
	[!source.includes("child_process") && !source.includes("eval(") && !source.includes("new Function"), "source has no process or dynamic execution APIs"],
];

const failures = checks.filter(([passes]) => !passes).map(([, label]) => label);
if (failures.length > 0) {
	for (const failure of failures) {
		console.error(`FAIL: ${failure}`);
	}
	process.exit(1);
}

console.log("Minimal Hidden Files smoke checks passed.");
