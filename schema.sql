CREATE TABLE IF NOT EXISTS air_quality_log (
  time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  id TEXT NOT NULL,
  rco2 INT,
  pm02 INT,
  tvoc INT,
  nox INT,
  atmp REAL,
  rhum REAL
);

CREATE TABLE IF NOT EXISTS sensors (
  id TEXT NOT NULL UNIQUE,
  name TEXT,
  rco2 BOOLEAN,
  pm02 BOOLEAN,
  tvoc BOOLEAN,
  nox BOOLEAN,
  atmp BOOLEAN,
  rhum BOOLEAN
)