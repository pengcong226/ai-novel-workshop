// Quick verification script
/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require('fs');

console.log('=== Genre Profile System Verification ===\n');

// Check types file
const typesFile = '/data/share/project/ai-novel-workshop/src/types/genreProfile.ts';
if (fs.existsSync(typesFile)) {
  console.log('✅ Types file exists:', typesFile);
  const content = fs.readFileSync(typesFile, 'utf8');
  if (content.includes('export interface GenreProfile')) {
    console.log('   ✅ Contains GenreProfile interface');
  }
  if (content.includes('export function getGenreProfile')) {
    console.log('   ✅ Contains getGenreProfile function');
  }
  if (content.includes('export function registerGenreProfile')) {
    console.log('   ✅ Contains registerGenreProfile function');
  }
} else {
  console.log('❌ Types file missing');
}

console.log('\n--- Genre Files ---');

const genreDir = '/data/share/project/ai-novel-workshop/src/data/genres/';
const genres = ['xuanhuan', 'xianxia', 'urban', 'history', 'mystery', 
                'scifi', 'wuxia', 'romance', 'game', 'lightnovel'];

genres.forEach(genre => {
  const filePath = genreDir + genre + '.ts';
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    const ruleCount = (content.match(/'/g) || []).length / 2; // Approximate
    console.log(`✅ ${genre}.ts exists (${Math.floor(ruleCount/10)}x10 rules)`);
  } else {
    console.log(`❌ ${genre}.ts missing`);
  }
});

console.log('\n--- Index File ---');
const indexFile = genreDir + 'index.ts';
if (fs.existsSync(indexFile)) {
  console.log('✅ index.ts exists');
  const content = fs.readFileSync(indexFile, 'utf8');
  if (content.includes('registerAllGenres')) {
    console.log('   ✅ Contains registerAllGenres function');
  }
} else {
  console.log('❌ index.ts missing');
}

console.log('\n=== Verification Complete ===');
