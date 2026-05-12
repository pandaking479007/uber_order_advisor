exports.handler = async () => {
  return {
    statusCode: 501,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      error: "not_implemented",
      message: "Daily Tesla sync needs stored OAuth tokens and a database. OAuth scaffolding is present; implement refresh + vehicle/charging pulls next.",
    }),
  };
};
