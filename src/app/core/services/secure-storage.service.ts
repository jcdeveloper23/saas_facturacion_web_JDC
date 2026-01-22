import { Injectable } from '@angular/core';
import * as CryptoJS from 'crypto-js';
import { environment } from '../../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class SecureStorageService {
    // Use a secret key from environment or fallback to a hardcoded one (for demo purposes)
    // In production, this key should be managed securely, but for client-side obfuscation
    // to preventing "simply seeing" the token, this suffices.
    private readonly SECRET_KEY = environment.production
        ? 'YOUR_PRODUCTION_SECRET_KEY' // Should ideally be unique or fetched
        : 'gps-monitor-secure-key-v1';

    constructor() { }

    /**
     * Encrypt and save data to localStorage
     */
    setItem(key: string, value: any): void {
        try {
            const jsonValue = JSON.stringify(value);
            const encryptedValue = CryptoJS.AES.encrypt(jsonValue, this.SECRET_KEY).toString();
            localStorage.setItem(key, encryptedValue);
        } catch (error) {
            console.error('Error encrypting data', error);
        }
    }

    /**
     * Decrypt and get data from localStorage
     */
    getItem<T>(key: string): T | null {
        try {
            const encryptedValue = localStorage.getItem(key);
            if (!encryptedValue) {
                return null;
            }

            const bytes = CryptoJS.AES.decrypt(encryptedValue, this.SECRET_KEY);
            const decryptedString = bytes.toString(CryptoJS.enc.Utf8);

            if (!decryptedString) {
                return null;
            }

            return JSON.parse(decryptedString) as T;
        } catch (error) {
            // If decryption fails, it might be unencrypted data or invalid key
            // Attempt to read as raw for backward compatibility or return null
            console.warn('Error decrypting data, attempting raw read', error);
            try {
                const raw = localStorage.getItem(key);
                return raw ? JSON.parse(raw) : null;
            } catch {
                return null;
            }
        }
    }

    /**
     * Remove item from localStorage
     */
    removeItem(key: string): void {
        localStorage.removeItem(key);
    }

    /**
     * Clear all localStorage
     */
    clear(): void {
        localStorage.clear();
    }
}
