import { callOk, close } from "./client.ts";

const PATH = "ffi_users";

callOk("db_insert", {
  path: PATH,
  sql: "INSERT OR REPLACE INTO users (id, name, age) VALUES (1, 'tom', 18)",
});

console.log("inserted user 1");
close();
