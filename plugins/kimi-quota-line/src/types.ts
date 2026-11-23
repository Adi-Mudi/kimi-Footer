export interface QuotaData {
	wUsed: number;
	wLimit: number;
	wResetAt: string | undefined;
	hUsed: number;
	hLimit: number;
	hResetAt: string | undefined;
	hRemaining: string;
}

export interface RequestQuotaData {
	used: number;
	limit: number;
	resetsAt?: string;
}

export interface GitInfo {
	branch: string;
	count: number;
	text: string;
	isWorktree: boolean;
}

export interface SessionEntry {
	model: string | null;
	provider: string | null;
	updatedAt: number;
}

export interface QuotaCache {
	ts: number;
	model: string | null;
	kimi: QuotaData | null;
	minimax: QuotaData | null;
	openrouter?: RequestQuotaData | null;
	openrouter2?: RequestQuotaData | null;
	opencodeGo?: QuotaData | null;
	cline?: QuotaData | null;
	sessions?: Record<string, SessionEntry>;
	keyStatus?: Record<string, "ok" | "key" | "api">;
}

export interface StatusLinePayload {
	model: string;
	cwd: string;
	gitBranch: string | null;
	permissionMode: string;
	planMode: boolean;
	contextUsage: number;
	contextTokens: number;
	maxContextTokens: number;
	sessionId: string;
	version: string;
}
