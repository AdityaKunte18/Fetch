import Fastify from "fastify";
import websocket from "@fastify/websocket";

const fastify = Fastify({ logger: true });

const start = async () => {
  await fastify.register(websocket);

  fastify.get("/health", async () => ({ ok: true }));

  fastify.get("/ws", { websocket: true }, (conn) => {
    conn.socket.on("message", (message) => {
      conn.socket.send(
        JSON.stringify({
          type: "echo",
          data: message.toString(),
        })
      );
    });
  });

  const port = Number(process.env.PORT ?? 3001);
  await fastify.listen({ port, host: "0.0.0.0" });
};

start().catch((err) => {
  fastify.log.error(err);
  process.exit(1);
});
