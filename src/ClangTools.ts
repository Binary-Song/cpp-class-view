import { spawn } from 'node:child_process';
import * as fs from 'fs';
import { ExtensionInterface } from './ExtensionInterface';
import path from 'node:path';
import { split } from 'split-cmd';
export class ClangTools {

    constructor(
        private extension: ExtensionInterface,
        private tools: {
            clang: string,
            clangCl: string,
            clangPlusPlus: string
            cxxFilt: string,
        }) {
    }

    public static create(binDir: string, extension: ExtensionInterface): ClangTools | undefined {
        const ext = process.platform === 'win32' ? '.exe' : '';
        const tools = {
            clang: binDir + "/clang" + ext,
            clangCl: binDir + "/clang-cl" + ext,
            clangPlusPlus: binDir + "/clang++" + ext,
            cxxFilt: binDir + "/llvm-cxxfilt" + ext,
        };
        for (const [toolName, toolPath] of Object.entries(tools)) {
            if (!fs.existsSync(toolPath)) {
                return undefined;
            }
        }
        return new ClangTools(extension, tools);
    }

    private async spawnProcess(program: string, args: string[]): Promise<string | undefined> {
        let stdout = "";
        let stderr = "";
        const process = await spawn(program, args);
        process.stdout.on('data', (data) => {
            stdout += data;
        });
        process.stderr.on('data', (data) => {
            stderr += data;
        });
        return new Promise((resolve, reject) => {
            process.on('close', (code) => {
                this.extension.writeOutput(`Process ${program} exited with code ${code}.\nArgs: ${args.join(' ')}\nStdout: ${stdout}\nStderr: ${stderr}`);
                if (code === 0) {
                    resolve(stdout);
                } else {
                    resolve(undefined);
                }
            });
        });
    }

    public async demangle(name: string | undefined) {
        if (!name) {
            return undefined;
        }
        const result = await this.spawnProcess(this.tools.cxxFilt, [name]);
        return result;
    }

    public async compile(args: string[]): Promise<string | undefined> {
        args = args.concat(["-fsyntax-only", "--target=x86_64-pc-linux-gnu", "-Xclang", "-ast-dump=json"]);
        const result = await this.spawnProcess(this.tools.clang, args);
        return result;
    }

    public findCompilationDatabase(source_path: string) {
        let filePath = path.normalize(source_path);
        let compile_command_paths = [];
        let num = 64;
        while (num >= 0) {
            const dir = path.dirname(filePath);
            if (!dir || dir === filePath) {
                break;
            }
            compile_command_paths.push(path.join(dir, "compile_commands.json"));
            filePath = dir;
            num--;
        }
        for (let path of compile_command_paths) {
            if (fs.existsSync(path)) {
                return path;
            }
        }
        return undefined;
    }

    public getCompileArgs(cdb_path: string, file: string): string[] | undefined {
        const cdb = JSON.parse(fs.readFileSync(cdb_path, "utf8"));
        file = path.resolve(file);
        for (let entry of cdb) {
            const entryFile = path.resolve(entry.file);
            if (!path.relative(entryFile, file)) {
                if (!entry.arguments) {
                    const args = split(entry.command); 
                    if (args.length >= 1) {
                        return args.slice(1);
                    }
                    this.extension.writeOutput(`Failed to split command into args: ${entry.command}`);
                    return undefined;
                }
                return entry.arguments;
            }
        }
        this.extension.writeOutput("Failed to find file ${file} in compilation database.");
        return undefined;
    }
}