import "dotenv/config";
import cors from "cors";
import express from "express";
import { gameRouter } from "./routes/game.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? "http://localhost:3000" }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "wanted-checkers-api" });
});

app.use("/api/game", gameRouter);

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "Internal server error." });
});

app.listen(port, () => {
  console.log(`WANTED CHECKERS API listening on http://localhost:${port}`);
});
