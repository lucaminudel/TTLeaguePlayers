import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ../../config relative from scripts/ folder
const sourceDir = path.resolve(__dirname, '../../config');
// ../public/assets relative from scripts/ folder
const targetDir = path.resolve(__dirname, '../public/assets');

// Create target directory if it doesn't exist
if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
}

// Copy all JSON files
try {
    if (!fs.existsSync(sourceDir)) {
        console.error(`❌ Source config directory not found: ${sourceDir}`);
        process.exit(1);
    }

    const files = fs.readdirSync(sourceDir).filter(file => file.endsWith('.json'));

    if (files.length === 0) {
        console.warn(`⚠️ No .json files found in ${sourceDir}`);
    }

    files.forEach(file => {
        const sourcePath = path.join(sourceDir, file);
        const targetPath = path.join(targetDir, file);

        fs.copyFileSync(sourcePath, targetPath);
        console.log(`Copied ${file} to public/assets/`);
    });

    console.log(`✅ Copied ${files.length} config files`);
} catch (error) {
    console.error('❌ Failed to copy config files:', error.message);
    process.exit(1);
}
