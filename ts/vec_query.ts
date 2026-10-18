const res: any = await fetch("http://127.0.0.1:44944/database", {
  method: "POST",
  headers: {
    "Content-Type": "application/libary",
    "FFI-Symbol": "db_vec_query",
  },
  body: JSON.stringify({
    path: "./users",
    table: "vec_users",
    embedding: [0.1, 0.2, 0.3, 0.4],
    k: 3,
  }),
});

console.log(await res.json());

