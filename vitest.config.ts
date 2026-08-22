import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		include: ["tests/**/*.test.ts"],
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts"],
			exclude: ["src/index.ts", "src/types/**"],
			reporter: ["text", "html"],
			// Floors set just under the current suite (see `npm run test:coverage`)
			// so a real regression fails CI without blocking on the last few
			// points of already-tracked gaps (Filters/Player/Moodenglink/autoplay).
			thresholds: {
				statements: 80,
				branches: 75,
				functions: 75,
				lines: 85,
			},
		},
	},
});
