const fs = require('fs');
const path = require('path');
const https = require('https');

const modelName = 'Xenova/bge-small-zh-v1.5';
const baseUrl = `https://hf-mirror.com/${modelName}/resolve/main/`;
const targetDir = path.join(__dirname, 'public', 'models', modelName);
const onnxDir = path.join(targetDir, 'onnx');

const files = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'special_tokens_map.json',
  'onnx/model_quantized.onnx'
];

function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

ensureDirSync(targetDir);
ensureDirSync(onnxDir);

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${url}...`);
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
        console.log(`Redirecting to ${res.headers.location}...`);
        downloadFile(res.headers.location.startsWith('http') ? res.headers.location : `https://hf-mirror.com${res.headers.location}`, dest)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`Failed to get '${url}' (${res.statusCode})`));
        return;
      }

      const file = fs.createWriteStream(dest);
      let total = parseInt(res.headers['content-length'] || '0', 10);
      let current = 0;

      res.on('data', (chunk) => {
        current += chunk.length;
        if (total > 0 && current % (1024 * 1024 * 5) < chunk.length) { // Log every ~5MB
            process.stdout.write(`\rProgress: ${Math.round(current/total*100)}% (${(current/1024/1024).toFixed(1)}MB / ${(total/1024/1024).toFixed(1)}MB)`);
        }
      });

      res.pipe(file);
      file.on('finish', () => {
        file.close();
        process.stdout.write('\n');
        console.log(`Downloaded ${dest}`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function main() {
  console.log(`Starting download for ${modelName}...`);
  for (const file of files) {
    const url = baseUrl + file;
    const dest = path.join(targetDir, file);
    if (fs.existsSync(dest)) {
      console.log(`File ${dest} already exists, skipping.`);
      continue;
    }
    try {
      await downloadFile(url, dest);
    } catch (e) {
      console.error(`\nError downloading ${file}:`, e);
      process.exit(1);
    }
  }
  console.log('All files downloaded successfully!');
}

main();