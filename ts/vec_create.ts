const res = await fetch("http://127.0.0.1:44944/database", {
  method: "POST",
  headers: {
    "Content-Type": "application/libary",
    "FFI-Symbol": "db_vec_create",
  },
  body: JSON.stringify({
    path: "./users",
    table: "vec_users",
    dimensions: 4,
  }),
});

console.log(await res.json());
