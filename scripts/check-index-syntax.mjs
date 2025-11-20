import fs from 'fs';

const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const parts = html.split('<script>');
if (parts.length < 2) {
  console.error('No <script> tag found in public/index.html');
  process.exit(1);
}
const script = parts[1].split('</script>')[0];
try {
  // eslint-disable-next-line no-new, no-new-func
  new Function(script);
  console.log('OK: inline script in public/index.html parses without syntax errors.');
} catch (e) {
  console.error('Syntax error in inline script from public/index.html:');
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
}
