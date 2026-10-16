import { bindings, defineConfig } from "cf/config";

export default defineConfig({
	worker: {
		name: "sparrow-mcp",
		compatibilityDate: "2026-09-01",
		compatibilityFlags: [
			"nodejs_compat",
		],
		entrypoint: "src/worker.ts",
		observability: {
			enabled: true,
		},
		env: {
			LOG_LEVEL: bindings.text("info"),
		},
	},
});
