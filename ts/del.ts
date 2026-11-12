import { callOk, close } from "./client.ts";

const PATH = "ffi_users";

callOk("db_delete", {
  path: PATH,
  sql: "DELETE FROM users WHERE id = 1",
});

console.log("deleted user 1");
close();
