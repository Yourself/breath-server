import express from "express";
import path from "path";
import { AirQualityDB, QueryParams, hasAQData } from "./data";

const LISTEN_PORT = 3000;

const db = new AirQualityDB();

db.initTables();

const app = express();

function isDeviceIdValid(id: string) {
  return !/^\s+$/.test(id);
}

app.use(express.static(path.join(__dirname, "..", "dist")));
app.use(express.json());

app.get("/", (_, res) => {
  res.send("Breath Server");
});

app.post("/restricted/submit/:device", (req, res) => {
  if (!isDeviceIdValid(req.params.device)) {
    res.status(400).send({ error: "Invalid device ID" });
    return;
  }
  if (!hasAQData(req.body)) {
    res.status(400).send({ error: "Missing air quality data" });
    return;
  }
  try {
    db.insertAirQuality(req.params.device, req.body);
    res.sendStatus(200);
  } catch (e) {
    res.status(500).send({
      error: "An internal exception was raised",
      exception: e,
    });
  }
});

app.put("/restriced/update-device/:device", (req, res) => {
  const id = req.params.device;
  if (!isDeviceIdValid(id)) {
    res.status(400).send({ error: "Invalid device ID" });
    return;
  }
  try {
    db.updateDeviceMetadata(id, req.query);
  } catch (e) {
    res.status(500).send({
      error: "An internal exception was raised",
      exception: e,
    });
  }
});

app.get("/devices", (_, res) => {
  try {
    res.send(db.getDevices());
  } catch (e) {
    res.status(500).send({
      error: "An internal exception was raised",
      exception: e,
    });
  }
});

app.get("/query", (req, res) => {
  try {
    const results = db.getReadings(req.query as QueryParams);
    res.send(results);
  } catch (e) {
    res.status(500).send({
      error: "An internal exception was raised",
      exception: e,
    });
  }
});

app.listen(LISTEN_PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server started on port ${LISTEN_PORT}.`);
});
