import express from "express";
import path from "path";
import { AirQualityDB, hasAQData } from "./data";

const LISTEN_PORT = 3000;

const db = new AirQualityDB();

db.initTables();

const app = express();

app.use(express.static(path.join(__dirname, "..", "dist")));
app.use(express.json());

app.get("/", (_, res) => {
  res.send("Breath Server");
});

app.post("/submit/:device", (req, res) => {
  if (hasAQData(req.body)) {
    db.insertAirQuality(req.params.device, req.body);
    res.sendStatus(200);
  } else {
    res.sendStatus(400);
  }
});

app.get("/query", (req, res) => {});

app.listen(LISTEN_PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server started on port ${LISTEN_PORT}.`);
});
