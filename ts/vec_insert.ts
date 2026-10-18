const res = await fetch("http://127.0.0.1:44944/database", {
  method: "POST",
  headers: {
    "Content-Type": "application/libary",
    "FFI-Symbol": "db_vec_insert",
  },
  body: JSON.stringify({
    path: "./users",
    table: "vec_users",
    rowid: 1,
    embedding: [0.1, 0.2, 0.3, 0.4],
  }),
});

console.log(await res.json());

