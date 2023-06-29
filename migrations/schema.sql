CREATE TABLE IF NOT EXISTS air_quality_log (
  time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  id TEXT NOT NULL,
  rco2 REAL,
  pm02 REAL,
  tvoc REAL,
  nox REAL,
  atmp REAL,
  rhum REAL
);

CREATE TABLE IF NOT EXISTS sensors (
  id TEXT NOT NULL UNIQUE,
  name TEXT,
  has_rco2 BOOLEAN,
  has_pm02 BOOLEAN,
  has_tvoc BOOLEAN,
  has_nox BOOLEAN,
  has_atmp BOOLEAN,
  has_rhum BOOLEAN,
  is_hidden BOOLEAN NOT NULL DEFAULT 0
)