const res = await fetch("http://127.0.0.1:44944/libdatabase", {
  method: "POST",
  headers: {
    "Content-Type": "application/database",
    "FFI-Symbol": "db_query",
  },
  body: JSON.stringify({
    path: "users",
    sql: "SELECT * FROM users",
  }),
});

console.log(await res.json());
