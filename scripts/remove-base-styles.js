#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const dirs = [
  path.join(__dirname, '..', 'previews'),
  path.join(__dirname, '..', 'previews', 'location-photobooth'),
];

for (const dir of dirs) {
  if (!fs.existsSync(dir)) continue;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));
  for (const file of files) {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf-8');

    // Check if file starts with a <style> block containing base resets
    const match = content.match(/^<style>\s*\n?([\s\S]*?)<\/style>\s*\n?/);
    if (match) {
      const styleContent = match[1];
      if (styleContent.includes('box-sizing: border-box') || styleContent.includes('body { margin: 0')) {
        // Remove the first <style>...</style> block
        content = content.slice(match[0].length);
        fs.writeFileSync(filePath, content, 'utf-8');
        console.log(`Cleaned: ${path.relative(path.join(__dirname, '..'), filePath)}`);
      }
    }
  }
}

console.log('Done.');
