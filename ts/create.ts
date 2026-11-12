import { callOk, close } from "./client.ts";

const PATH = "ffi_users";

callOk("db_create", {
  path: PATH,
  table: "users",
  schema: "id INTEGER PRIMARY KEY, name TEXT, age INTEGER",
});

console.log("created table users in", PATH);
close();
