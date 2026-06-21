const res = await fetch("http://127.0.0.1:44944/libdatabase", {
  method: "POST",
  headers: {
    "Content-Type": "application/database",
    "FFI-Symbol": "db_delete",
  },
  body: JSON.stringify({
    path: "users",
    sql: "DELETE FROM users WHERE id = 1",
  }),
});

console.log(await res.json());
