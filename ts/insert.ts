const res = await fetch("http://127.0.0.1:44944/database", {
  method: "POST",
  headers: {
    "Content-Type": "application/libary",
    "FFI-Symbol": "db_insert",
  },
  body: JSON.stringify({
    path: "./users",
    sql: "INSERT INTO users (id, name, age) VALUES (1, 'tom', 18)",
  }),
});

console.log(await res.json());

