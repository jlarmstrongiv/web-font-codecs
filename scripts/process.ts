/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 John L. Armstrong IV.
 */
import { spawn } from 'node:child_process';
export interface ProcessOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdio?: 'inherit' | 'pipe';
  signal?: AbortSignal;
}
export interface ProcessResult {
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: Buffer;
  stderr: Buffer;
}
/** Shell-free async execution. Capture bytes by default, including binary CLI output. */
export function execute(command: string, args: string[], options: ProcessOptions = {}): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: options.stdio === 'inherit' ? 'inherit' : ['ignore', 'pipe', 'pipe'] });
    const stdout: Buffer[] = [], stderr: Buffer[] = [];
    const interrupt = () => { child.kill('SIGINT'); };
    const terminate = () => { child.kill('SIGTERM'); };
    const cleanup = () => { process.off('SIGINT', interrupt); process.off('SIGTERM', terminate); };
    process.on('SIGINT', interrupt); process.on('SIGTERM', terminate);
    child.stdout?.on('data', (data: Buffer) => stdout.push(data));
    child.stderr?.on('data', (data: Buffer) => stderr.push(data));
    child.once('error', error => { cleanup(); reject(error); });
    child.once('close', (status, signal) => { cleanup(); resolve({ status, signal, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) }); });
  });
}
export async function run(command: string, args: string[], options: ProcessOptions = {}): Promise<ProcessResult> {
  const result = await execute(command, args, options);
  if (result.status !== 0) throw new Error(`${command} failed (${result.signal ?? result.status}): ${result.stderr.toString()}`);
  return result;
}
