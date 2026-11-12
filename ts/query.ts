import { call, close } from "./client.ts";

const PATH = "ffi_users";

const res = call("db_query", {
  path: PATH,
  sql: "SELECT * FROM users ORDER BY id",
});

console.log(JSON.stringify(res, null, 2));
close();
