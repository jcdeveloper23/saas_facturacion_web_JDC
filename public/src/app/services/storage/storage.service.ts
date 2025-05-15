import { Injectable } from '@angular/core';
import { AngularFireStorage } from '@angular/fire/storage';
import { Observable } from 'rxjs';
import { last, mergeMap } from 'rxjs/operators';
@Injectable({
  providedIn: 'root'
})
export class StorageService {

  constructor(private storage: AngularFireStorage) { }

  uploadFile(filePath: string, file: File | Blob): Promise<any> {
    const fileRef = this.storage.ref(filePath);
    const task = this.storage.upload(filePath, file);

    return task.snapshotChanges().pipe(
      last(),
      mergeMap(() => fileRef.getDownloadURL())
    ).toPromise();
  }

  $uploadFile(filePath: string, file: File | Blob): Observable<any> {
    const fileRef = this.storage.ref(filePath);
    const task = this.storage.upload(filePath, file);

    return task.snapshotChanges().pipe(
      last(),
      mergeMap(() => fileRef.getDownloadURL())
    );
  }

  deleteFileByURL(fileURL: string): Promise<any> {
    return this.storage.storage.refFromURL(fileURL).delete();
  }
}
