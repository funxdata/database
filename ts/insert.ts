const res = await fetch("http://127.0.0.1:44944/libdatabase", {
  method: "POST",
  headers: {
    "Content-Type": "application/database",
    "FFI-Symbol": "db_insert",
  },
  body: JSON.stringify({
    path: "./users",
    sql: "INSERT INTO users (id, name, age) VALUES (1, 'tom', 18)",
  }),
});

console.log(await res.json());

