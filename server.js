import express from "express";
import cors from "cors";
import http from "node:http";
import { Server } from "socket.io";

import { config } from "./src/config.js";
import { registerSocketHandlers } from "./src/socket.js";

const app = express();
app.use(cors({ origin: config.origin }));
app.use(express.json({ limit: "10kb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "Vibely API" });
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: config.origin, methods: ["GET", "POST"] },
  maxHttpBufferSize: 100_000
});

registerSocketHandlers(io);

server.listen(config.port, () => {
  console.log(`Vibely API listening on http://localhost:${config.port}`);
});