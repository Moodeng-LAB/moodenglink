import { describe, expect, it, vi } from "vitest";
import { Moodenglink } from "../src/classes/Moodenglink";
import { Plugin } from "../src/classes/Plugin";

class TestPlugin extends Plugin {
	readonly name = "test-plugin";
	load = vi.fn();
	unload = vi.fn();
}

function manager() {
	return new Moodenglink({ nodes: [{ host: "h", identifier: "n1" }], clientId: "bot", send: () => {} });
}

describe("Plugin lifecycle", () => {
	it("use() loads a plugin once and ignores duplicates", () => {
		const m = manager();
		const plugin = new TestPlugin();

		m.use(plugin);
		m.use(plugin); // duplicate name — ignored

		expect(plugin.load).toHaveBeenCalledTimes(1);
		expect(m.plugins.size).toBe(1);
	});

	it("removePlugin() unloads and unregisters, by instance or name", () => {
		const m = manager();
		const plugin = new TestPlugin();
		m.use(plugin);

		m.removePlugin("test-plugin");

		expect(plugin.unload).toHaveBeenCalledTimes(1);
		expect(m.plugins.size).toBe(0);
		// Removing an unknown plugin is a no-op.
		expect(() => m.removePlugin("nope")).not.toThrow();
	});

	it("destroyAll() unloads every registered plugin", async () => {
		const m = manager();
		const plugin = new TestPlugin();
		m.use(plugin);

		await m.destroyAll();

		expect(plugin.unload).toHaveBeenCalledTimes(1);
		expect(m.plugins.size).toBe(0);
	});
});
