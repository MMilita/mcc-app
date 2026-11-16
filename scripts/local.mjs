// Impostazioni personali NON versionate: .local.json nella cartella del progetto (in .gitignore)
// { "gcloudAccount": "tuo-account@gmail.com", "admins": ["tuo-account@gmail.com"] }
import { existsSync, readFileSync } from 'node:fs';
const file = new URL('../.local.json', import.meta.url);
export const local = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
export const GCLOUD_ACCOUNT = process.env.GCLOUD_ACCOUNT || local.gcloudAccount || '';
export const accountFlag = () => {
  if (!GCLOUD_ACCOUNT) throw new Error('Manca l\'account gcloud: crea .local.json con { "gcloudAccount": "..." } oppure imposta GCLOUD_ACCOUNT');
  return `--account=${GCLOUD_ACCOUNT}`;
};
