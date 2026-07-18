import { describe, expect, it } from "vitest";
import packageJson from "../package.json";
import { version } from "../src";

describe("version export", () => {
	it("always matches package.json", () => {
		expect(version).toBe(packageJson.version);
	});
});
