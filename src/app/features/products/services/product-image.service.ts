import { Injectable, inject } from '@angular/core';
import {
  Storage, ref, uploadBytesResumable, getDownloadURL, deleteObject
} from '@angular/fire/storage';
import { TenantService } from '../../../core/services/tenant.service';

export interface UploadProgress {
  state: 'uploading' | 'done' | 'error';
  progress: number;   // 0-100
  url?: string;
  error?: string;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_MB   = 2;

@Injectable({ providedIn: 'root' })
export class ProductImageService {
  private storage       = inject(Storage);
  private tenantService = inject(TenantService);

  private get companyId(): string {
    return this.tenantService.companyId;
  }

  /**
   * Uploads the image for a specific slot (0–3).
   * Slot 0 = imagen principal (backward-compat path: main.ext).
   * Slots 1-3 use img1.ext, img2.ext, img3.ext.
   */
  uploadAt(
    productId: string,
    slot: number,
    file: File,
    onProgress: (pct: number) => void
  ): Promise<string> {
    const ext      = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const filename = slot === 0 ? `main.${ext}` : `img${slot}.${ext}`;
    return this._upload(productId, filename, file, onProgress);
  }

  /** Validates and uploads a product image. Returns a Promise<string> (download URL). */
  upload(
    productId: string,
    file: File,
    onProgress: (pct: number) => void
  ): Promise<string> {
    const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    return this._upload(productId, `main.${ext}`, file, onProgress);
  }

  private _upload(
    productId: string,
    filename: string,
    file: File,
    onProgress: (pct: number) => void
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const validationError = this.validate(file);
      if (validationError) {
        console.warn('[ImageService] validation failed:', validationError);
        reject(new Error(validationError));
        return;
      }

      const companyId  = this.companyId;
      const path       = `companies/${companyId}/products/${productId}/${filename}`;

      console.log('[ImageService] upload start', {
        companyId, productId, path,
        fileName: file.name, fileSize: file.size, fileType: file.type,
        storage: this.storage
      });

      const storageRef = ref(this.storage, path);
      const task       = uploadBytesResumable(storageRef, file, { contentType: file.type });

      console.log('[ImageService] task created, state:', task.snapshot.state);

      task.on(
        'state_changed',
        snap => {
          const pct = snap.totalBytes > 0
            ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100)
            : 0;
          console.log(`[ImageService] progress ${pct}% — ${snap.bytesTransferred}/${snap.totalBytes} state=${snap.state}`);
          onProgress(pct);
        },
        err => {
          console.error('[ImageService] upload error', err?.code, err?.message, err);
          reject(err);
        },
        async () => {
          console.log('[ImageService] upload complete, getting download URL...');
          try {
            const url = await getDownloadURL(task.snapshot.ref);
            console.log('[ImageService] download URL:', url);
            resolve(url);
          } catch (e) {
            console.error('[ImageService] getDownloadURL failed:', e);
            reject(e);
          }
        }
      );
    });
  }

  /** Deletes the image at the given Storage URL. Silently ignores if already deleted. */
  async delete(imageUrl: string): Promise<void> {
    try {
      const storageRef = ref(this.storage, imageUrl);
      await deleteObject(storageRef);
    } catch (e: any) {
      // object-not-found is OK — already deleted or never existed
      if (e?.code !== 'storage/object-not-found') throw e;
    }
  }

  validate(file: File): string | null {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return 'Formato no soportado. Use JPG, PNG o WEBP.';
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return `El archivo supera el límite de ${MAX_SIZE_MB} MB.`;
    }
    return null;
  }
}
