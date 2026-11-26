import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tmpHome = "";
const prevHome = process.env.KIMI_CODE_HOME;

async function loadFetcher() {
	vi.resetModules();
	return await import("../src/cline-fetcher.js");
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

const FAKE_TOKEN = "test-cline-token";
const TOML_KEY = "api_key";

describe("cline-fetcher", () => {
	beforeEach(() => {
		tmpHome = mkdtempSync(join(tmpdir(), "cline-fetcher-test-"));
		writeFileSync(
			join(tmpHome, "config.toml"),
			`[providers.cline-pass]\n${TOML_KEY} = "${FAKE_TOKEN}"\n`,
			"utf-8",
		);
		process.env.KIMI_CODE_HOME = tmpHome;
	});

	afterEach(() => {
		if (prevHome === undefined) {
			delete process.env.KIMI_CODE_HOME;
		} else {
			process.env.KIMI_CODE_HOME = prevHome;
		}
		if (tmpHome) {
			rmSync(tmpHome, { recursive: true, force: true });
			tmpHome = "";
		}
		vi.unstubAllGlobals();
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("parses all three windows (monthly, weekly, five_hour)", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			jsonResponse({
				success: true,
				data: {
					limits: [
						{ type: "monthly", percentUsed: 42, resetsAt: "2026-12-01" },
						{ type: "weekly", percentUsed: 18.5, resetsAt: "2026-11-30T00:00:00Z" },
						{ type: "five_hour", percentUsed: 7, resetsAt: "2026-11-27T05:00:00Z" },
					],
				},
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const { fetchClineUsage, getClineData } = await loadFetcher();
		await fetchClineUsage();

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://api.cline.bot/api/v1/users/me/plan/usage-limits");
		expect(init.headers).toEqual({
			Authorization: "Bearer test-cline-token",
			Accept: "application/json",
		});
		expect(init.signal).toBeInstanceOf(AbortSignal);

		expect(getClineData()).toEqual({
			mUsed: 42,
			mLimit: 100,
			mResetAt: "2026-12-01",
			wUsed: 18.5,
			wLimit: 100,
			wResetAt: "2026-11-30T00:00:00Z",
			hUsed: 7,
			hLimit: 100,
			hResetAt: "2026-11-27T05:00:00Z",
			hRemaining: "",
		});
	});

	it("omits missing weekly window (sets wLimit = 0)", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			jsonResponse({
				success: true,
				data: {
					limits: [
						{ type: "monthly", percentUsed: 30, resetsAt: "2026-12-01" },
						{ type: "five_hour", percentUsed: 12, resetsAt: "2026-11-27T05:00:00Z" },
					],
				},
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const { fetchClineUsage, getClineData } = await loadFetcher();
		await fetchClineUsage();

		const data = getClineData();
		expect(data).not.toBeNull();
		expect(data?.wUsed).toBe(0);
		expect(data?.wLimit).toBe(0);
		expect(data?.wResetAt).toBeUndefined();
		expect(data?.mUsed).toBe(30);
		expect(data?.mLimit).toBe(100);
		expect(data?.hUsed).toBe(12);
		expect(data?.hLimit).toBe(100);
	});

	it("enforces 60s cooldown on HTTP 429 before retrying fetch", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(1_700_000_000_000);

		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
			.mockResolvedValueOnce(
				jsonResponse({
					success: true,
					data: {
						limits: [{ type: "monthly", percentUsed: 25, resetsAt: "2026-12-01" }],
					},
				}),
			);
		vi.stubGlobal("fetch", fetchMock);

		const { fetchClineUsage, getClineData } = await loadFetcher();

		await fetchClineUsage();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(getClineData()).toBeNull();

		vi.advanceTimersByTime(10_000);
		await fetchClineUsage();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(getClineData()).toBeNull();

		vi.advanceTimersByTime(50_001);
		await fetchClineUsage();
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(getClineData()?.mUsed).toBe(25);
	});

	it("clamps percentUsed to [0, 100]", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			jsonResponse({
				success: true,
				data: {
					limits: [
						{ type: "monthly", percentUsed: -15, resetsAt: "2026-12-01" },
						{ type: "weekly", percentUsed: 145, resetsAt: "2026-11-30T00:00:00Z" },
						{ type: "five_hour", percentUsed: "102.5", resetsAt: "2026-11-27T05:00:00Z" },
					],
				},
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const { fetchClineUsage, getClineData } = await loadFetcher();
		await fetchClineUsage();

		const data = getClineData();
		expect(data?.mUsed).toBe(0);
		expect(data?.wUsed).toBe(100);
		expect(data?.hUsed).toBe(100);
	});

	it("passes 4s AbortSignal.timeout and handles timeout abort cleanly", async () => {
		const controller = new AbortController();
		const timeoutSpy = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
		const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
			expect(init?.signal).toBe(controller.signal);
			controller.abort(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
			throw controller.signal.reason;
		});
		vi.stubGlobal("fetch", fetchMock);

		const { fetchClineUsage, getClineData } = await loadFetcher();
		await expect(fetchClineUsage()).resolves.toBeUndefined();

		expect(timeoutSpy).toHaveBeenCalledWith(4000);
		expect(getClineData()).toBeNull();
	});
});
