const express = require('express');
const session = require('express-session');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Crash Protection ──────────────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  // Don't exit - keep server running
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});

// ── Users ─────────────────────────────────────────────────────────────────────
const USERS = {
  'Alire': { password: 'Sajiannusantara', role: 'master', displayName: 'Alire' },
};

// ── Database ──────────────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'alire.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize SQLite database
const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL'); // Better concurrency

// Create tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tableId TEXT NOT NULL,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    pax INTEGER NOT NULL,
    duration INTEGER DEFAULT 150,
    staff TEXT,
    notes TEXT,
    babyChairs INTEGER DEFAULT 0,
    combos TEXT DEFAULT '[]',
    preOrder TEXT DEFAULT '[]',
    poNote TEXT DEFAULT '',
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS waiting (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    pax INTEGER NOT NULL,
    zone TEXT,
    notes TEXT,
    addedAt TEXT NOT NULL,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date);
  CREATE INDEX IF NOT EXISTS idx_bookings_type ON bookings(type);

  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    birthday TEXT,
    memberSince TEXT NOT NULL,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS promotions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    discountPct REAL NOT NULL DEFAULT 0,
    minPurchase REAL NOT NULL DEFAULT 0,
    maxDiscount REAL NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    triggerType TEXT DEFAULT 'manual',
    triggerValue TEXT DEFAULT NULL,
    combinable INTEGER NOT NULL DEFAULT 0,
    daysBefore INTEGER DEFAULT 5,
    daysAfter INTEGER DEFAULT 5,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    memberPhone TEXT NOT NULL,
    memberName TEXT NOT NULL,
    billAmount REAL NOT NULL,
    promoId INTEGER,
    promoCode TEXT,
    promoId2 INTEGER DEFAULT NULL,
    promoCode2 TEXT DEFAULT NULL,
    discountAmount REAL NOT NULL DEFAULT 0,
    finalAmount REAL NOT NULL,
    notes TEXT,
    date TEXT NOT NULL,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_phone ON transactions(memberPhone);
  CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
`);

// Migration: add endedAt column if it doesn't exist yet (for existing databases)
try {
  const cols = db.prepare("PRAGMA table_info(bookings)").all();
  const hasEndedAt = cols.some(c => c.name === 'endedAt');
  if (!hasEndedAt) {
    db.exec(`ALTER TABLE bookings ADD COLUMN endedAt TEXT DEFAULT NULL`);
    console.log('✅ Migration: added endedAt column to bookings table');
  }
} catch (e) {
  console.error('Migration error (endedAt):', e);
}

// Migration: add phone column to waiting table if it doesn't exist yet
try {
  const wcols = db.prepare("PRAGMA table_info(waiting)").all();
  const hasPhone = wcols.some(c => c.name === 'phone');
  if (!hasPhone) {
    db.exec(`ALTER TABLE waiting ADD COLUMN phone TEXT DEFAULT ''`);
    console.log('✅ Migration: added phone column to waiting table');
  }
} catch (e) {
  console.error('Migration error (waiting.phone):', e);
}

// Migration: add name column to members table if it doesn't exist yet
try {
  const mcols = db.prepare("PRAGMA table_info(members)").all();
  const hasName = mcols.some(c => c.name === 'name');
  if (!hasName) {
    db.exec(`ALTER TABLE members ADD COLUMN name TEXT DEFAULT ''`);
    console.log('✅ Migration: added name column to members table');
  }
} catch (e) {
  console.error('Migration error (members.name):', e);
}

// Migration: add birthday column to members table if it doesn't exist yet
try {
  const bcols = db.prepare("PRAGMA table_info(members)").all();
  const hasBirthday = bcols.some(c => c.name === 'birthday');
  if (!hasBirthday) {
    db.exec(`ALTER TABLE members ADD COLUMN birthday TEXT DEFAULT NULL`);
    console.log('✅ Migration: added birthday column to members table');
  }
} catch (e) {
  console.error('Migration error (members.birthday):', e);
}

// Migration: add active column to promotions table if it doesn't exist yet
try {
  const pcols = db.prepare("PRAGMA table_info(promotions)").all();
  const hasActive = pcols.some(c => c.name === 'active');
  if (!hasActive) {
    db.exec(`ALTER TABLE promotions ADD COLUMN active INTEGER NOT NULL DEFAULT 1`);
    console.log('✅ Migration: added active column to promotions table');
  }
} catch (e) {
  console.error('Migration error (promotions.active):', e);
}

// Migration: add notes column to promotions table if it doesn't exist yet
try {
  const pncols = db.prepare("PRAGMA table_info(promotions)").all();
  const hasNotes = pncols.some(c => c.name === 'notes');
  if (!hasNotes) {
    db.exec(`ALTER TABLE promotions ADD COLUMN notes TEXT DEFAULT NULL`);
    console.log('✅ Migration: added notes column to promotions table');
  }
} catch (e) {
  console.error('Migration error (promotions.notes):', e);
}

try {
  const pcols2 = db.prepare("PRAGMA table_info(promotions)").all();
  if (!pcols2.some(c => c.name === 'triggerType')) {
    db.exec(`ALTER TABLE promotions ADD COLUMN triggerType TEXT DEFAULT 'manual'`);
    console.log('✅ Migration: added triggerType to promotions');
  }
  if (!pcols2.some(c => c.name === 'triggerValue')) {
    db.exec(`ALTER TABLE promotions ADD COLUMN triggerValue TEXT DEFAULT NULL`);
    console.log('✅ Migration: added triggerValue to promotions');
  }
} catch (e) {
  console.error('Migration error (promotions.trigger):', e);
}

try {
  const pcols3 = db.prepare("PRAGMA table_info(promotions)").all();
  if (!pcols3.some(c => c.name === 'combinable')) {
    db.exec(`ALTER TABLE promotions ADD COLUMN combinable INTEGER NOT NULL DEFAULT 0`);
    console.log('✅ Migration: added combinable to promotions');
  }
} catch (e) {
  console.error('Migration error (promotions.combinable):', e);
}

try {
  const pcols4 = db.prepare("PRAGMA table_info(promotions)").all();
  if (!pcols4.some(c => c.name === 'daysBefore')) {
    db.exec(`ALTER TABLE promotions ADD COLUMN daysBefore INTEGER DEFAULT 5`);
    console.log('✅ Migration: added daysBefore to promotions');
  }
  if (!pcols4.some(c => c.name === 'daysAfter')) {
    db.exec(`ALTER TABLE promotions ADD COLUMN daysAfter INTEGER DEFAULT 5`);
    console.log('✅ Migration: added daysAfter to promotions');
  }
} catch (e) {
  console.error('Migration error (promotions.birthday fields):', e);
}

try {
  const tcols = db.prepare("PRAGMA table_info(transactions)").all();
  if (!tcols.some(c => c.name === 'promoId2')) {
    db.exec(`ALTER TABLE transactions ADD COLUMN promoId2 INTEGER DEFAULT NULL`);
    console.log('✅ Migration: added promoId2 to transactions');
  }
  if (!tcols.some(c => c.name === 'promoCode2')) {
    db.exec(`ALTER TABLE transactions ADD COLUMN promoCode2 TEXT DEFAULT NULL`);
    console.log('✅ Migration: added promoCode2 to transactions');
  }
} catch (e) {
  console.error('Migration error (transactions.promo2):', e);
}

console.log('✓ SQLite database initialized');

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'alire-sajian-nusantara-session-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
    httpOnly: true
  }
}));

// Auth middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// Request validation helpers
function validateBooking(data) {
  const errors = [];
  if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
    errors.push('Name is required');
  }
  if (data.name && data.name.length > 30) {
    errors.push('Name must be 30 characters or less');
  }
  // Phone required ONLY for reservations, optional for walk-in and waiting list
  if (data.type === 'reservation') {
    if (!data.phone || typeof data.phone !== 'string' || data.phone.trim().length === 0) {
      errors.push('Phone number is required for reservations');
    }
  }
  if (!data.date || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
    errors.push('Valid date is required (YYYY-MM-DD)');
  }
  if (!data.time || !/^\d{2}:\d{2}$/.test(data.time)) {
    errors.push('Valid time is required (HH:MM)');
  }
  if (!data.pax || typeof data.pax !== 'number' || data.pax < 1 || data.pax > 500) {
    errors.push('Party size must be between 1 and 500');
  }
  if (!data.tableId || typeof data.tableId !== 'string') {
    errors.push('Table selection is required');
  }
  if (data.notes && data.notes.length > 150) {
    errors.push('Notes must be 150 characters or less');
  }
  return errors;
}

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// ── Auth routes ───────────────────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    const user = USERS[username];
    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    
    req.session.user = { username, role: user.role, displayName: user.displayName };
    res.json({ ok: true, user: req.session.user });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  if (req.session && req.session.user) {
    res.json(req.session.user);
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

// ── Booking routes ────────────────────────────────────────────────────────────
app.get('/api/bookings', requireAuth, (req, res) => {
  try {
    const { date } = req.query;
    let bookings;
    
    if (date) {
      const stmt = db.prepare('SELECT * FROM bookings WHERE date = ? ORDER BY time');
      bookings = stmt.all(date);
    } else {
      const stmt = db.prepare('SELECT * FROM bookings ORDER BY date DESC, time DESC LIMIT 1000');
      bookings = stmt.all();
    }
    
    // Parse JSON fields
    bookings = bookings.map(b => ({
      ...b,
      combos: JSON.parse(b.combos || '[]'),
      preOrder: JSON.parse(b.preOrder || '[]'),
    }));
    
    res.json(bookings);
  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

app.get('/api/bookings/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('SELECT * FROM bookings WHERE id = ?');
    const booking = stmt.get(id);
    
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    // Parse JSON fields
    booking.combos = JSON.parse(booking.combos || '[]');
    booking.preOrder = JSON.parse(booking.preOrder || '[]');
    
    res.json(booking);
  } catch (error) {
    console.error('Get booking error:', error);
    res.status(500).json({ error: 'Failed to fetch booking' });
  }
});

app.post('/api/bookings', requireAuth, (req, res) => {
  try {
    const data = req.body;
    
    // Validate
    const errors = validateBooking(data);
    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join(', ') });
    }
    
    // Sanitize and enforce limits
    const booking = {
      tableId: data.tableId,
      type: data.type || 'reservation',
      name: data.name.trim().slice(0, 30),
      phone: (data.phone || '').trim().slice(0, 20),
      date: data.date,
      time: data.time,
      pax: Math.min(500, Math.max(1, parseInt(data.pax))),
      duration: parseInt(data.duration) || 150,
      staff: (data.staff || '').trim(),
      notes: (data.notes || '').trim().slice(0, 150),
      babyChairs: parseInt(data.babyChairs) || 0,
      combos: JSON.stringify(data.combos || []),
      preOrder: JSON.stringify(data.preOrder || []),
      poNote: (data.poNote || '').trim()
    };
    
    const stmt = db.prepare(`
      INSERT INTO bookings (tableId, type, name, phone, date, time, pax, duration, staff, notes, babyChairs, combos, preOrder, poNote)
      VALUES (@tableId, @type, @name, @phone, @date, @time, @pax, @duration, @staff, @notes, @babyChairs, @combos, @preOrder, @poNote)
    `);
    
    const result = stmt.run(booking);
    
    // Return created booking
    const newBooking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(result.lastInsertRowid);
    newBooking.combos = JSON.parse(newBooking.combos);
    newBooking.preOrder = JSON.parse(newBooking.preOrder);
    
    res.json(newBooking);
  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

app.put('/api/bookings/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    
    // Validate
    const errors = validateBooking(data);
    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join(', ') });
    }
    
    // Check if exists
    const existing = db.prepare('SELECT id FROM bookings WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    // Sanitize and enforce limits
    const booking = {
      id: parseInt(id),
      tableId: data.tableId,
      type: data.type || 'reservation',
      name: data.name.trim().slice(0, 30),
      phone: (data.phone || '').trim().slice(0, 20),
      date: data.date,
      time: data.time,
      pax: Math.min(500, Math.max(1, parseInt(data.pax))),
      duration: parseInt(data.duration) || 150,
      staff: (data.staff || '').trim(),
      notes: (data.notes || '').trim().slice(0, 150),
      babyChairs: parseInt(data.babyChairs) || 0,
      combos: JSON.stringify(data.combos || []),
      preOrder: JSON.stringify(data.preOrder || []),
      poNote: (data.poNote || '').trim()
    };
    
    const stmt = db.prepare(`
      UPDATE bookings 
      SET tableId = @tableId, type = @type, name = @name, phone = @phone, date = @date, time = @time, 
          pax = @pax, duration = @duration, staff = @staff, notes = @notes, babyChairs = @babyChairs,
          combos = @combos, preOrder = @preOrder, poNote = @poNote
      WHERE id = @id
    `);
    
    stmt.run(booking);
    
    // Return updated booking
    const updated = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
    updated.combos = JSON.parse(updated.combos);
    updated.preOrder = JSON.parse(updated.preOrder);
    
    res.json(updated);
  } catch (error) {
    console.error('Update booking error:', error);
    res.status(500).json({ error: 'Failed to update booking' });
  }
});

app.delete('/api/bookings/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('DELETE FROM bookings WHERE id = ?');
    const result = stmt.run(id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete booking error:', error);
    res.status(500).json({ error: 'Failed to delete booking' });
  }
});

// End Session: marks booking as ended (frees table) but KEEPS the record for analytics
app.post('/api/bookings/:id/end', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const endedAt = new Date().toISOString();
    const stmt = db.prepare('UPDATE bookings SET endedAt = ? WHERE id = ?');
    const result = stmt.run(endedAt, id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const updated = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
    updated.combos = JSON.parse(updated.combos);
    updated.preOrder = JSON.parse(updated.preOrder);

    res.json(updated);
  } catch (error) {
    console.error('End session error:', error);
    res.status(500).json({ error: 'Failed to end session' });
  }
});

// ── Waiting list routes ───────────────────────────────────────────────────────
app.get('/api/waiting', requireAuth, (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM waiting ORDER BY createdAt');
    const waiting = stmt.all();
    res.json(waiting);
  } catch (error) {
    console.error('Get waiting list error:', error);
    res.status(500).json({ error: 'Failed to fetch waiting list' });
  }
});

app.post('/api/waiting', requireAuth, (req, res) => {
  try {
    const { name, phone, pax, zone, notes, addedAt } = req.body;
    
    if (!name || !pax || !addedAt) {
      return res.status(400).json({ error: 'Name, pax, and time are required' });
    }
    
    const stmt = db.prepare(`
      INSERT INTO waiting (name, phone, pax, zone, notes, addedAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      name.trim().slice(0, 30),
      (phone || '').trim().slice(0, 20),
      Math.min(500, Math.max(1, parseInt(pax))),
      zone || '',
      (notes || '').trim().slice(0, 150),
      addedAt
    );
    
    const newEntry = db.prepare('SELECT * FROM waiting WHERE id = ?').get(result.lastInsertRowid);
    res.json(newEntry);
  } catch (error) {
    console.error('Create waiting entry error:', error);
    res.status(500).json({ error: 'Failed to add to waiting list' });
  }
});

app.delete('/api/waiting/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('DELETE FROM waiting WHERE id = ?');
    const result = stmt.run(id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Entry not found' });
    }
    
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete waiting entry error:', error);
    res.status(500).json({ error: 'Failed to delete entry' });
  }
});

// ── Membership routes ─────────────────────────────────────────────────────────
const MEMBER_REMOVE_PASSWORD = 'americano';

app.get('/api/members', requireAuth, (req, res) => {
  try {
    const members = db.prepare('SELECT * FROM members ORDER BY memberSince DESC').all();
    res.json(members);
  } catch (error) {
    console.error('Get members error:', error);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

app.post('/api/members', requireAuth, (req, res) => {
  try {
    const { name, phone, birthday, memberSince } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (!phone || !phone.trim()) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    if (!birthday) {
      return res.status(400).json({ error: 'Birthday is required' });
    }
    if (!memberSince) {
      return res.status(400).json({ error: 'Member since date is required' });
    }
    const cleanName = name.trim().slice(0, 30);
    const cleanPhone = phone.trim().slice(0, 20);

    const existing = db.prepare('SELECT * FROM members WHERE phone = ?').get(cleanPhone);
    if (existing) {
      return res.status(409).json({ error: `This number is already a member (since ${existing.memberSince}).`, existing });
    }

    const stmt = db.prepare('INSERT INTO members (name, phone, birthday, memberSince) VALUES (?, ?, ?, ?)');
    const result = stmt.run(cleanName, cleanPhone, birthday, memberSince);
    const newMember = db.prepare('SELECT * FROM members WHERE id = ?').get(result.lastInsertRowid);
    res.json(newMember);
  } catch (error) {
    console.error('Create member error:', error);
    res.status(500).json({ error: 'Failed to add member' });
  }
});

app.put('/api/members/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, birthday, memberSince, password, confirmMerge } = req.body;

    const existing = db.prepare('SELECT * FROM members WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Member not found' });
    }

    const cleanName = (name !== undefined ? name : existing.name).trim().slice(0, 30);
    const cleanPhone = (phone !== undefined ? phone : existing.phone).trim().slice(0, 20);
    const newBirthday = birthday !== undefined ? birthday : existing.birthday;
    const newMemberSince = memberSince !== undefined ? memberSince : existing.memberSince;

    const protectedChanged = cleanName !== existing.name || cleanPhone !== existing.phone || newBirthday !== existing.birthday;

    if (protectedChanged) {
      if (password !== MEMBER_REMOVE_PASSWORD) {
        return res.status(403).json({ error: 'Incorrect password' });
      }
      if (!cleanName) return res.status(400).json({ error: 'Name is required' });
      if (!cleanPhone) return res.status(400).json({ error: 'Phone number is required' });
      if (!newBirthday) return res.status(400).json({ error: 'Birthday is required' });
    }

    if (!newMemberSince) {
      return res.status(400).json({ error: 'Member since date is required' });
    }

    const phoneChanged = cleanPhone !== existing.phone;

    if (phoneChanged) {
      // Phone must remain unique across members
      const conflict = db.prepare('SELECT * FROM members WHERE phone = ? AND id != ?').get(cleanPhone, id);
      if (conflict) {
        return res.status(409).json({ error: `This number is already used by member "${conflict.name}".` });
      }
      // Check if the new phone already has booking history under a different name — needs explicit merge confirmation
      const existingBookingsUnderNewPhone = db.prepare(
        "SELECT DISTINCT name FROM bookings WHERE phone = ? AND name IS NOT NULL AND name != ''"
      ).all(cleanPhone);
      const differentNames = existingBookingsUnderNewPhone.filter(r => r.name !== cleanName);
      if (differentNames.length > 0 && !confirmMerge) {
        return res.status(409).json({
          error: `This phone number already has booking history under the name "${differentNames[0].name}". Merging will combine both histories.`,
          needsMergeConfirm: true,
          existingName: differentNames[0].name
        });
      }
      // Re-link all bookings from old phone to new phone, so visit history (and milestones) carry over
      db.prepare('UPDATE bookings SET phone = ? WHERE phone = ?').run(cleanPhone, existing.phone);
    }

    db.prepare('UPDATE members SET name = ?, phone = ?, birthday = ?, memberSince = ? WHERE id = ?')
      .run(cleanName, cleanPhone, newBirthday, newMemberSince, id);

    // Keep transaction history in sync — update memberName and memberPhone if they changed
    db.prepare('UPDATE transactions SET memberName = ? WHERE memberPhone = ?').run(cleanName, existing.phone);
    if (phoneChanged) {
      db.prepare('UPDATE transactions SET memberPhone = ? WHERE memberPhone = ?').run(cleanPhone, existing.phone);
    }

    const updated = db.prepare('SELECT * FROM members WHERE id = ?').get(id);
    res.json(updated);
  } catch (error) {
    console.error('Update member error:', error);
    res.status(500).json({ error: 'Failed to update member' });
  }
});

app.delete('/api/members/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    if (password !== MEMBER_REMOVE_PASSWORD) {
      return res.status(403).json({ error: 'Incorrect password' });
    }
    const stmt = db.prepare('DELETE FROM members WHERE id = ?');
    const result = stmt.run(id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete member error:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// ── Promotions routes ─────────────────────────────────────────────────────────
app.get('/api/promotions', requireAuth, (req, res) => {
  try {
    const promos = db.prepare('SELECT * FROM promotions ORDER BY createdAt DESC').all();
    res.json(promos);
  } catch (error) {
    console.error('Get promotions error:', error);
    res.status(500).json({ error: 'Failed to fetch promotions' });
  }
});

app.post('/api/promotions', requireAuth, (req, res) => {
  try {
    const { code, name, discountPct, minPurchase, maxDiscount, notes, triggerType, triggerValue, combinable, daysBefore, daysAfter, password } = req.body;
    if (password !== MEMBER_REMOVE_PASSWORD) {
      return res.status(403).json({ error: 'Incorrect password' });
    }
    if (!code || !code.trim()) {
      return res.status(400).json({ error: 'Promo code is required' });
    }
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Promo name is required' });
    }
    const pct = discountPct ? parseFloat(discountPct) : 0;
    if (pct > 0 && (isNaN(pct) || pct > 100)) {
      return res.status(400).json({ error: 'Discount must be between 1 and 100%' });
    }
    const min = parseFloat(minPurchase) || 0;
    const max = parseFloat(maxDiscount) || 0;
    const cleanCode = code.trim().toUpperCase().slice(0, 20);
    const cleanName = name.trim().slice(0, 50);
    const cleanNotes = (notes || '').trim().slice(0, 300);
    const cleanTriggerType = ['manual','visit_number','tier','birthday'].includes(triggerType) ? triggerType : 'manual';
    const cleanTriggerValue = triggerValue ? triggerValue.trim() : null;
    const cleanCombinable = combinable ? 1 : 0;
    const cleanDaysBefore = parseInt(daysBefore) >= 0 ? parseInt(daysBefore) : 5;
    const cleanDaysAfter = parseInt(daysAfter) >= 0 ? parseInt(daysAfter) : 5;

    const existing = db.prepare('SELECT * FROM promotions WHERE code = ?').get(cleanCode);
    if (existing) {
      return res.status(409).json({ error: `Promo code "${cleanCode}" already exists.` });
    }

    const stmt = db.prepare('INSERT INTO promotions (code, name, discountPct, minPurchase, maxDiscount, notes, triggerType, triggerValue, combinable, daysBefore, daysAfter) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const result = stmt.run(cleanCode, cleanName, pct, min, max, cleanNotes||null, cleanTriggerType, cleanTriggerValue, cleanCombinable, cleanDaysBefore, cleanDaysAfter);
    const newPromo = db.prepare('SELECT * FROM promotions WHERE id = ?').get(result.lastInsertRowid);
    res.json(newPromo);
  } catch (error) {
    console.error('Create promotion error:', error);
    res.status(500).json({ error: 'Failed to add promotion' });
  }
});

app.delete('/api/promotions/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    if (password !== MEMBER_REMOVE_PASSWORD) {
      return res.status(403).json({ error: 'Incorrect password' });
    }
    const stmt = db.prepare('DELETE FROM promotions WHERE id = ?');
    const result = stmt.run(id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Promotion not found' });
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete promotion error:', error);
    res.status(500).json({ error: 'Failed to remove promotion' });
  }
});

app.put('/api/promotions/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { code, name, discountPct, minPurchase, maxDiscount, active, notes, triggerType, triggerValue, combinable, daysBefore, daysAfter, password } = req.body;
    if (password !== MEMBER_REMOVE_PASSWORD) {
      return res.status(403).json({ error: 'Incorrect password' });
    }
    if (!code || !code.trim()) return res.status(400).json({ error: 'Promo code is required' });
    if (!name || !name.trim()) return res.status(400).json({ error: 'Promo name is required' });
    const pct = discountPct ? parseFloat(discountPct) : 0;
    if (pct > 0 && (isNaN(pct) || pct > 100)) return res.status(400).json({ error: 'Discount must be between 1 and 100%' });
    const cleanCode = code.trim().toUpperCase().slice(0, 20);
    const cleanName = name.trim().slice(0, 50);
    const cleanNotesPut = (notes || '').trim().slice(0, 300);
    const cleanTriggerTypePut = ['manual','visit_number','tier','birthday'].includes(triggerType) ? triggerType : 'manual';
    const cleanTriggerValuePut = triggerValue ? triggerValue.trim() : null;
    const cleanCombinablePut = combinable ? 1 : 0;
    const cleanDaysBeforePut = parseInt(daysBefore) >= 0 ? parseInt(daysBefore) : 5;
    const cleanDaysAfterPut = parseInt(daysAfter) >= 0 ? parseInt(daysAfter) : 5;
    const min = parseFloat(minPurchase) || 0;
    const max = parseFloat(maxDiscount) || 0;
    const conflict = db.prepare('SELECT * FROM promotions WHERE code = ? AND id != ?').get(cleanCode, id);
    if (conflict) return res.status(409).json({ error: `Promo code "${cleanCode}" is already used by another promotion.` });
    const stmt = db.prepare('UPDATE promotions SET code=?, name=?, discountPct=?, minPurchase=?, maxDiscount=?, active=?, notes=?, triggerType=?, triggerValue=?, combinable=?, daysBefore=?, daysAfter=? WHERE id=?');
    const result = stmt.run(cleanCode, cleanName, pct, min, max, active ? 1 : 0, cleanNotesPut||null, cleanTriggerTypePut, cleanTriggerValuePut, cleanCombinablePut, cleanDaysBeforePut, cleanDaysAfterPut, id);
    if (result.changes === 0) return res.status(404).json({ error: 'Promotion not found' });
    // Keep past transactions in sync — if the code was renamed, update all transactions that used this promo
    db.prepare('UPDATE transactions SET promoCode = ? WHERE promoId = ?').run(cleanCode, id);
    const updated = db.prepare('SELECT * FROM promotions WHERE id = ?').get(id);
    res.json(updated);
  } catch (error) {
    console.error('Update promotion error:', error);
    res.status(500).json({ error: 'Failed to update promotion' });
  }
});

app.put('/api/promotions/:id/status', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { active, password } = req.body;
    if (password !== MEMBER_REMOVE_PASSWORD) {
      return res.status(403).json({ error: 'Incorrect password' });
    }
    const stmt = db.prepare('UPDATE promotions SET active = ? WHERE id = ?');
    const result = stmt.run(active ? 1 : 0, id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Promotion not found' });
    }
    const updated = db.prepare('SELECT * FROM promotions WHERE id = ?').get(id);
    res.json(updated);
  } catch (error) {
    console.error('Toggle promotion status error:', error);
    res.status(500).json({ error: 'Failed to update promotion status' });
  }
});

// ── Transactions routes ───────────────────────────────────────────────────────
app.get('/api/transactions', requireAuth, (req, res) => {
  try {
    const txns = db.prepare('SELECT * FROM transactions ORDER BY date DESC, createdAt DESC').all();
    res.json(txns);
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

app.post('/api/transactions', requireAuth, (req, res) => {
  try {
    const { phone, billAmount, promoId, promoId2, notes, date } = req.body;

    if (!phone || !phone.trim()) {
      return res.status(400).json({ error: 'Member is required' });
    }
    const member = db.prepare('SELECT * FROM members WHERE phone = ?').get(phone.trim());
    if (!member) {
      return res.status(404).json({ error: 'This phone number is not a registered member' });
    }

    const bill = parseFloat(billAmount);
    if (isNaN(bill) || bill <= 0) {
      return res.status(400).json({ error: 'A valid bill amount is required' });
    }

    let discountAmount = 0;
    let promoCode = null;
    let resolvedPromoId = null;
    let promoCode2 = null;
    let resolvedPromoId2 = null;

    // Helper to calculate discount for a promo
    function calcPromoDiscount(pid) {
      const promo = db.prepare('SELECT * FROM promotions WHERE id = ?').get(pid);
      if (!promo) throw new Error('Selected promotion no longer exists');
      if (!promo.active) throw new Error('This promotion is no longer active');
      if (promo.minPurchase > 0 && bill < promo.minPurchase) {
        throw new Error(`Bill amount is below the minimum purchase (Rp ${promo.minPurchase.toLocaleString('id-ID')}) for this promo`);
      }
      let disc = 0;
      if (promo.discountPct) {
        disc = bill * (promo.discountPct / 100);
        if (promo.maxDiscount > 0 && disc > promo.maxDiscount) disc = promo.maxDiscount;
        disc = Math.round(disc);
      }
      return { promo, disc };
    }

    if (promoId) {
      const { promo, disc } = calcPromoDiscount(promoId);
      discountAmount += disc;
      promoCode = promo.code;
      resolvedPromoId = promo.id;
    }

    if (promoId2) {
      if (!promoId) return res.status(400).json({ error: 'Promo 2 requires Promo 1 to be selected first' });
      const { promo, disc } = calcPromoDiscount(promoId2);
      if (!promo.combinable) return res.status(400).json({ error: 'This promotion cannot be combined' });
      discountAmount += disc;
      promoCode2 = promo.code;
      resolvedPromoId2 = promo.id;
    }

    const finalAmount = Math.max(0, bill - discountAmount);
    const txnDate = date || new Date().toISOString().slice(0, 10);

    const stmt = db.prepare(`
      INSERT INTO transactions (memberPhone, memberName, billAmount, promoId, promoCode, promoId2, promoCode2, discountAmount, finalAmount, notes, date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      member.phone, member.name, bill, resolvedPromoId, promoCode, resolvedPromoId2, promoCode2,
      discountAmount, finalAmount, (notes || '').trim().slice(0, 200), txnDate
    );
    const newTxn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid);
    res.json(newTxn);
  } catch (error) {
    console.error('Create transaction error:', error);
    res.status(500).json({ error: error.message || 'Failed to record transaction' });
  }
});

// ── Delete Transaction ────────────────────────────────────────────────────────
app.delete('/api/transactions/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    if (password !== MEMBER_REMOVE_PASSWORD) {
      return res.status(403).json({ error: 'Incorrect password' });
    }
    const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete transaction error:', error);
    res.status(500).json({ error: 'Failed to remove transaction' });
  }
});

// ── Download DB Backup ────────────────────────────────────────────────────────
app.get('/api/download-db', requireAuth, (req, res) => {
  try {
    // Force WAL checkpoint to ensure all data is in the main db file
    db.pragma('wal_checkpoint(TRUNCATE)');
    
    if (!fs.existsSync(DB_FILE)) {
      return res.status(404).json({ error: 'Database file not found' });
    }
    const timestamp = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Disposition', `attachment; filename="alire_backup_${timestamp}.db"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.sendFile(DB_FILE);
  } catch (error) {
    console.error('Download DB error:', error);
    res.status(500).json({ error: 'Failed to download database' });
  }
});

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  try {
    // Test database connection
    db.prepare('SELECT 1').get();
    res.json({ ok: true, database: 'connected' });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ── SPA ───────────────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start Server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✓ Alire Table Management running on port ${PORT}`);
  console.log(`✓ Database: ${DB_FILE}`);
  console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing database...');
  db.close();
  process.exit(0);
});
