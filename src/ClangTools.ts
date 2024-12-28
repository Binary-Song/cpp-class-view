import * as ffi from 'ffi-napi';
import * as ref from 'ref-napi';
import { spawn } from 'node:child_process';
import { WritableStreamBuffer } from 'stream-buffers';
import * as fs from 'fs';

export class ClangTools {

    clangPath: string;
    clangClPath: string;
    clangPlusPlusPath: string;

    constructor(clangPath: string,
        clangClPath: string,
        clangPlusPlusPath: string) {
        this.clangPath = clangPath;
        this.clangClPath = clangClPath;
        this.clangPlusPlusPath = clangPlusPlusPath;
    }

    public static create(binDir: string): ClangTools | undefined {
        const ext = process.platform === 'win32' ? '.exe' : '';
        const tools = [binDir + "/clang" + ext, binDir + "/clang-cl" + ext, binDir + "/clang++" + ext];
        for (const tool of tools) {
            if (!fs.existsSync(tool)) {
                return undefined;
            }
        }
        return new ClangTools(tools[0], tools[1], tools[2]);
    }

    public async compile(args: string[]) : Promise<string | undefined> {
        let stdout = "";
        let stderr = "";
        args = args.concat(["-fsyntax-only", "-Xclang", "-ast-dump=json"]);
        const process = await spawn(this.clangPath, args);
        process.on('exit', (code) => {
        });
        process.stdout.on('data', (data) => {
            stdout += data;
        });
        process.stderr.on('data', (data) => {
            stderr += data;
        });
        return new Promise((resolve, reject) => {
            process.on('exit', (code) => {
                console.log("clang exit code: " + code);
                console.log("clang args: " + args);
                console.log("clang stdout: " + stdout);
                if (code === 0) {
                    resolve(stdout);
                } else {
                    resolve(undefined);
                }
            });
        });
    }
}