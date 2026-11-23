import { basename } from "node:path";

export function styledCwd(cwd: string): string {
	const folderName = basename(cwd) || "/";
	const magenta = "\x1b[38;5;198m"; 
	const orange = "\x1b[38;5;208m"; 
	const white = "\x1b[37m"; 
	const reset = "\x1b[0m";
	return `${magenta}›${orange}›${white} ${folderName}${reset}`;
}
