/**
 * Sunset directory styling — magenta ›, orange ›, white folder name.
 * Verbatim port from 01_pi-Footer/.pi/extensions/pi-footer/sunset-dir.ts
 */
import { basename } from "node:path";

/**
 * Renders the working directory with sunset gradient (magenta ›, orange ›, white folder).
 * @param cwd - Current working directory path.
 * @returns Styled "›› folder-name" string with ANSI colors.
 */
export function styledCwd(cwd: string): string {
	const folderName = basename(cwd) || "/";
	const magenta = "\x1b[38;5;198m"; // bright magenta
	const orange = "\x1b[38;5;208m"; // orange
	const white = "\x1b[37m"; // white
	const reset = "\x1b[0m";
	return `${magenta}›${orange}›${white} ${folderName}${reset}`;
}
