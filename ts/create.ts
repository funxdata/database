const res = await fetch("http://127.0.0.1:44944/libdatabase", {
  method: "POST",
  headers: {
    "Content-Type": "application/database",
    "FFI-Symbol": "db_create",
  },
  body: JSON.stringify({
    path: "./users",
    table: "users",
    schema: "id INTEGER PRIMARY KEY, name TEXT, age INTEGER",
  }),
});

console.log(await res.json());

