import CryptoJS from 'crypto-js';

function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is required');
  }
  return key;
}

export function encrypt(text: string): string {
  if (!text) return '';
  return CryptoJS.AES.encrypt(text, getEncryptionKey()).toString();
}

export function decrypt(ciphertext: string): string {
  if (!ciphertext) return '';
  const bytes = CryptoJS.AES.decrypt(ciphertext, getEncryptionKey());
  return bytes.toString(CryptoJS.enc.Utf8);
}
