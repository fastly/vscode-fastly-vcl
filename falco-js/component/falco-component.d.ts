// world root:component/root
export type * as WasiCliEnvironment0212 from './interfaces/wasi-cli-environment.js'; // import wasi:cli/environment@0.2.12
export type * as WasiCliExit0212 from './interfaces/wasi-cli-exit.js'; // import wasi:cli/exit@0.2.12
export type * as WasiCliStderr0212 from './interfaces/wasi-cli-stderr.js'; // import wasi:cli/stderr@0.2.12
export type * as WasiCliStdin0212 from './interfaces/wasi-cli-stdin.js'; // import wasi:cli/stdin@0.2.12
export type * as WasiCliStdout0212 from './interfaces/wasi-cli-stdout.js'; // import wasi:cli/stdout@0.2.12
export type * as WasiCliTerminalInput0212 from './interfaces/wasi-cli-terminal-input.js'; // import wasi:cli/terminal-input@0.2.12
export type * as WasiCliTerminalOutput0212 from './interfaces/wasi-cli-terminal-output.js'; // import wasi:cli/terminal-output@0.2.12
export type * as WasiCliTerminalStderr0212 from './interfaces/wasi-cli-terminal-stderr.js'; // import wasi:cli/terminal-stderr@0.2.12
export type * as WasiCliTerminalStdin0212 from './interfaces/wasi-cli-terminal-stdin.js'; // import wasi:cli/terminal-stdin@0.2.12
export type * as WasiCliTerminalStdout0212 from './interfaces/wasi-cli-terminal-stdout.js'; // import wasi:cli/terminal-stdout@0.2.12
export type * as WasiClocksMonotonicClock0212 from './interfaces/wasi-clocks-monotonic-clock.js'; // import wasi:clocks/monotonic-clock@0.2.12
export type * as WasiClocksWallClock0212 from './interfaces/wasi-clocks-wall-clock.js'; // import wasi:clocks/wall-clock@0.2.12
export type * as WasiFilesystemPreopens0212 from './interfaces/wasi-filesystem-preopens.js'; // import wasi:filesystem/preopens@0.2.12
export type * as WasiFilesystemTypes0212 from './interfaces/wasi-filesystem-types.js'; // import wasi:filesystem/types@0.2.12
export type * as WasiIoError0212 from './interfaces/wasi-io-error.js'; // import wasi:io/error@0.2.12
export type * as WasiIoPoll0212 from './interfaces/wasi-io-poll.js'; // import wasi:io/poll@0.2.12
export type * as WasiIoStreams0212 from './interfaces/wasi-io-streams.js'; // import wasi:io/streams@0.2.12
export type * as WasiRandomRandom0212 from './interfaces/wasi-random-random.js'; // import wasi:random/random@0.2.12
export function lint(source: string, options: string): string;
export function format(source: string, config: string): string;
export function parse(source: string): string;
export function tokenize(source: string): string;
export type Result<T, E> = { tag: 'ok', val: T } | { tag: 'err', val: E };
