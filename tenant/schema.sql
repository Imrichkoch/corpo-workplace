PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tenants (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS members (
 tenant TEXT NOT NULL REFERENCES tenants(id), user TEXT NOT NULL REFERENCES users(id),
 role TEXT NOT NULL CHECK(role IN ('owner','admin','member')), PRIMARY KEY(tenant,user)
);
CREATE TABLE IF NOT EXISTS teams (
 tenant TEXT NOT NULL REFERENCES tenants(id), id TEXT NOT NULL, name TEXT NOT NULL,
 PRIMARY KEY(tenant,id), UNIQUE(tenant,name COLLATE NOCASE)
);
CREATE TABLE IF NOT EXISTS team_members (
 tenant TEXT NOT NULL, team TEXT NOT NULL, user TEXT NOT NULL,
 PRIMARY KEY(tenant,team,user),
 FOREIGN KEY(tenant,team) REFERENCES teams(tenant,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant,user) REFERENCES members(tenant,user) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS offices (
 tenant TEXT NOT NULL REFERENCES tenants(id), id TEXT NOT NULL, name TEXT NOT NULL, address TEXT NOT NULL,
 archived INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(tenant,id)
);
CREATE TABLE IF NOT EXISTS plans (
 tenant TEXT NOT NULL, id TEXT NOT NULL, office TEXT NOT NULL,
 name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('office','parking')), mime TEXT NOT NULL, image BLOB NOT NULL,
 PRIMARY KEY(tenant,id), FOREIGN KEY(tenant,office) REFERENCES offices(tenant,id)
);
CREATE TABLE IF NOT EXISTS resources (
 tenant TEXT NOT NULL, id TEXT NOT NULL, office TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('desk','room','parking')), name TEXT NOT NULL, description TEXT NOT NULL,
 capacity INTEGER NOT NULL, team TEXT, plan TEXT, x REAL, y REAL, archived INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(tenant,id),
 FOREIGN KEY(tenant,office) REFERENCES offices(tenant,id),
 FOREIGN KEY(tenant,team) REFERENCES teams(tenant,id),
 FOREIGN KEY(tenant,plan) REFERENCES plans(tenant,id)
);
CREATE TABLE IF NOT EXISTS reservations (
 tenant TEXT NOT NULL, id TEXT NOT NULL, resource TEXT NOT NULL,
 user TEXT NOT NULL REFERENCES users(id), date TEXT NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL,
 title TEXT NOT NULL, cancelled INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(tenant,id), FOREIGN KEY(tenant,resource) REFERENCES resources(tenant,id), CHECK(start < end)
);
CREATE INDEX IF NOT EXISTS reservations_slot ON reservations(tenant,resource,date,start,end) WHERE cancelled=0;
CREATE TABLE IF NOT EXISTS visits (
 tenant TEXT NOT NULL, id TEXT NOT NULL, office TEXT NOT NULL, user TEXT NOT NULL REFERENCES users(id),
 name TEXT NOT NULL, company TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'expected' CHECK(status IN ('expected','arrived','departed')),
 PRIMARY KEY(tenant,id), FOREIGN KEY(tenant,office) REFERENCES offices(tenant,id)
);
CREATE TABLE IF NOT EXISTS sessions (
 hash TEXT PRIMARY KEY, user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user);
CREATE TABLE IF NOT EXISTS mobile_admin_access (
 hash TEXT PRIMARY KEY, parent TEXT NOT NULL REFERENCES sessions(hash) ON DELETE CASCADE,
 tenant TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('ticket','browser')), expires INTEGER NOT NULL,
 UNIQUE(parent,kind)
);
CREATE INDEX IF NOT EXISTS mobile_admin_expiry ON mobile_admin_access(expires);
CREATE TABLE IF NOT EXISTS links (
 id TEXT PRIMARY KEY, hash TEXT NOT NULL UNIQUE, kind TEXT NOT NULL CHECK(kind IN ('signup','invite','reset')),
 email TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', company TEXT NOT NULL DEFAULT '',
 tenant TEXT REFERENCES tenants(id), sender TEXT REFERENCES users(id), role TEXT CHECK(role IN ('admin','member')),
 team TEXT, expires INTEGER NOT NULL, created INTEGER NOT NULL, used INTEGER, revoked INTEGER,
 delivery TEXT NOT NULL DEFAULT 'pending' CHECK(delivery IN ('pending','sent','failed')),
 FOREIGN KEY(tenant,team) REFERENCES teams(tenant,id)
);
CREATE INDEX IF NOT EXISTS links_tenant_email ON links(tenant,email,kind);
CREATE INDEX IF NOT EXISTS links_expiry ON links(expires);
CREATE TABLE IF NOT EXISTS limits (
 key TEXT NOT NULL, bucket INTEGER NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(key,bucket)
);
