CREATE TABLE IF NOT EXISTS air_quality_log_v1 (
  time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  id TEXT NOT NULL,
  rco2 REAL,
  pm01 REAL,
  pm02 REAL,
  pm10 REAL,
  pCnt REAL,
  tvoc REAL,
  nox REAL,
  atmp REAL,
  rhum REAL
);

CREATE TABLE IF NOT EXISTS sensors_v1 (
  id TEXT NOT NULL UNIQUE,
  name TEXT,
  channels INT,
  has_rco2 BOOLEAN,
  has_pm01 BOOLEAN,
  has_pm02 BOOLEAN,
  has_pm10 BOOLEAN,
  has_pCnt BOOLEAN,
  has_tvoc BOOLEAN,
  has_nox BOOLEAN,
  has_atmp BOOLEAN,
  has_rhum BOOLEAN,
  is_hidden BOOLEAN NOT NULL DEFAULT 0
);

BEGIN TRANSACTION;
INSERT INTO air_quality_log_v1 (time, id, rco2, pm02, tvoc, nox, atmp, rhum) SELECT * FROM air_quality_log;
INSERT INTO sensors_v1 (id, name, has_rco2, has_pm02, has_tvoc, has_nox, has_atmp, has_rhum, is_hidden) SELECT * FROM sensors;

DROP TABLE air_quality_log;
DROP TABLE sensors;

ALTER TABLE air_quality_log_v1 RENAME TO air_quality_log;
ALTER TABLE sensors_v1 RENAME TO sensors;

PRAGMA user_version = 1;
COMMIT TRANSACTION;