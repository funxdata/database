/**
 * Deno FFI 客户端：直接加载 database 动态库，不经过 HTTP。
 *
 * 运行前先 `cargo build --release`，或通过 DATABASE_LIB 指定库路径。
 */

export type FfiSymbol =
  | "db_create"
  | "db_insert"
  | "db_update"
  | "db_delete"
  | "db_query";

export interface DbResponse<T = unknown> {
  code: number;
  data: T;
  msg: string;
}

function defaultLibPath(): string {
  // ts/ 测试统一在 ts 目录下执行，因此动态库位于上一级的 target/release。
  // 也可以通过 DATABASE_LIB 指定绝对路径。
  switch (Deno.build.os) {
    case "windows":
      return "../target/release/database.dll";
    case "darwin":
      return "../target/release/libdatabase.dylib";
    default:
      return "../target/release/libdatabase.so";
  }
}

export const LIB_PATH = Deno.env.get("DATABASE_LIB") ?? defaultLibPath();

const lib = Deno.dlopen(LIB_PATH, {
  db_create: { parameters: ["buffer", "buffer"], result: "i32" },
  db_insert: { parameters: ["buffer", "buffer"], result: "i32" },
  db_update: { parameters: ["buffer", "buffer"], result: "i32" },
  db_delete: { parameters: ["buffer", "buffer"], result: "i32" },
  db_query: { parameters: ["buffer", "buffer"], result: "i32" },
});

type FfiFn = (input: Uint8Array, output: Uint8Array) => number;
const symbols = lib.symbols as unknown as Record<FfiSymbol, FfiFn>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface CallOptions {
  /** 输出缓冲区大小，默认 1 MiB，与 src/utils/cjson.rs 的 MAX_JSON_OUT 一致。 */
  bufferSize?: number;
}

/** 调用一个导出符号，返回解析后的响应封套。 */
export function call<T = unknown>(
  symbol: FfiSymbol,
  body: unknown,
  options: CallOptions = {},
): DbResponse<T> {
  const bufferSize = options.bufferSize ?? 1024 * 1024;
  const input = encoder.encode(JSON.stringify(body) + "\0");
  const output = new Uint8Array(bufferSize);

  const rc = symbols[symbol](input, output);
  if (rc !== 0) {
    throw new Error(`${symbol} FFI error: ${rc} (-1 空指针 / -2 超过输出上限)`);
  }

  const end = output.indexOf(0);
  const text = decoder.decode(
    output.subarray(0, end === -1 ? output.length : end),
  );
  if (!text) {
    throw new Error(`${symbol} returned an empty response`);
  }
  return JSON.parse(text) as DbResponse<T>;
}

/** 调用并断言业务码为 200，直接返回 data。 */
export function callOk<T = unknown>(
  symbol: FfiSymbol,
  body: unknown,
  options: CallOptions = {},
): T {
  const res = call<T>(symbol, body, options);
  if (res.code !== 200) {
    throw new Error(`${symbol} failed: ${res.msg} (code=${res.code})`);
  }
  return res.data;
}

/** 释放动态库句柄。脚本结束前调用。 */
export function close(): void {
  lib.close();
}
