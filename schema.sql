-- Election 2026 - Family/Member Database Schema
-- MySQL Workbench mein is file ko run karke database bana lein.
-- Koi seed/dummy data nahi hai — sirf structure hai.

CREATE DATABASE IF NOT EXISTS election2026;
USE election2026;

CREATE TABLE IF NOT EXISTS families (
  id INT AUTO_INCREMENT PRIMARY KEY,
  family_number INT NOT NULL UNIQUE,
  family_label VARCHAR(255) DEFAULT NULL,   -- optional e.g. "tailor family"
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  family_id INT NOT NULL,
  name_hindi VARCHAR(255) NOT NULL,          -- naam Hindi (Devanagari) mein
  name_search VARCHAR(255) NOT NULL,         -- auto-generated roman/hinglish version, search ke liye
  mobile VARCHAR(15) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
);

CREATE INDEX idx_name_search ON members(name_search);
CREATE INDEX idx_name_hindi ON members(name_hindi);
CREATE INDEX idx_mobile ON members(mobile);
