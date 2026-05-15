import "dotenv/config";
import cors from "cors";
import express from "express";
import { authRouter } from "./routes/auth.js";
import { gameRouter } from "./routes/game.js";
import { playersRouter } from "./routes/players.js";
import { defaultAvatarSvg } from "./uploads/avatarUpload.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? "http://localhost:3000" }));
app.use(express.json());
app.use("/uploads", express.static("uploads"));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "wanted-checkers-api" });
});

app.get("/api/avatars/default/:username", (req, res) => {
  res.type("image/svg+xml").send(defaultAvatarSvg(req.params.username));
});

app.use("/api/auth", authRouter);
app.use("/api/game", gameRouter);
app.use("/api/players", playersRouter);

app.use((error, _req, res, _next) => {
  if (error.code === "23505") {
    res.status(409).json({ error: "A record with those unique fields already exists." });
    return;
  }

  console.error(error);
  res.status(500).json({ error: "Internal server error." });
});

app.listen(port, () => {
  console.log(`WANTED CHECKERS API listening on http://localhost:${port}`);
});
