DROP TABLE IF EXISTS Games;
DROP TABLE IF EXISTS Shelves;

CREATE TABLE Shelves (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  photo_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Games (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  bgg_id TEXT,
  publisher TEXT,
  shelf_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shelf_id) REFERENCES Shelves(id) ON DELETE CASCADE
);

CREATE INDEX idx_games_title ON Games(title);
CREATE INDEX idx_games_publisher ON Games(publisher);
