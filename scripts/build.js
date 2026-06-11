#!/usr/bin/env node

/**
 * Simple build script for cache busting
 * Generates content-hashed filenames for CSS and JS
 */

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

const DIST_DIR = 'dist';

// Files to hash (source -> output prefix)
const FILES_TO_HASH = [
  { src: 'app.js', prefix: 'app' },
  { src: 'styles.css', prefix: 'styles' },
];

// Static files to copy as-is
const STATIC_FILES = [
  '_headers',
  'robots.txt',
  'sitemap.xml',
  'site.webmanifest',
  'favicon.ico',
  'favicon.svg',
  'favicon-96x96.png',
  'apple-touch-icon.png',
  'og-image.png',
  'web-app-manifest-192x192.png',
  'web-app-manifest-512x512.png',
];

function getContentHash(content) {
  return createHash('md5').update(content).digest('hex').slice(0, 8);
}

function build() {
  console.log('🔨 Building...\n');

  // Clean and create dist directory
  if (existsSync(DIST_DIR)) {
    rmSync(DIST_DIR, { recursive: true });
  }
  mkdirSync(DIST_DIR);

  // Track hashed filenames for index.html replacement
  const hashMap = {};

  // Process files that need hashing
  for (const { src, prefix } of FILES_TO_HASH) {
    const content = readFileSync(src, 'utf-8');
    const hash = getContentHash(content);
    const ext = src.split('.').pop();
    const hashedName = `${prefix}.${hash}.${ext}`;

    writeFileSync(join(DIST_DIR, hashedName), content);
    hashMap[src] = hashedName;

    console.log(`  ✓ ${src} → ${hashedName}`);
  }

  // Copy static files
  for (const file of STATIC_FILES) {
    if (existsSync(file)) {
      cpSync(file, join(DIST_DIR, file));
    }
  }
  console.log(`  ✓ Copied ${STATIC_FILES.length} static files`);

  // Process index.html with hashed references
  let indexContent = readFileSync('index.html', 'utf-8');

  // Replace references with hashed versions
  for (const [original, hashed] of Object.entries(hashMap)) {
    // Match both with and without query strings
    const regex = new RegExp(`${original.replace('.', '\\.')}(\\?v=[^"']*)?`, 'g');
    indexContent = indexContent.replace(regex, hashed);
  }

  writeFileSync(join(DIST_DIR, 'index.html'), indexContent);
  console.log('  ✓ index.html (with hashed references)\n');

  console.log('✅ Build complete! Output in ./dist/');
}

build();
