import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-document-upload',
  templateUrl: './document-upload.component.html',
  styleUrls: ['./document-upload.component.css']
})
export class DocumentUploadComponent {

  @Input() documentLabel: string = '';
  @Input() currentImageUrl: string = '';
  @Input() isVerified: boolean = false;
  @Output() onFileSelected = new EventEmitter<File>();

  public previewUrl: string = '';
  public hasNewFile: boolean = false;

  /**
   * Handle file input change
   */
  public handleFileInput(event: any): void {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file
    if (!this.validateFile(file)) {
      event.target.value = ''; // Reset input
      return;
    }

    // Generate preview
    this.generatePreview(file);

    // Emit file to parent
    this.onFileSelected.emit(file);
    this.hasNewFile = true;
  }

  /**
   * Validate file type and size
   */
  private validateFile(file: File): boolean {
    const validTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    const maxSize = 5 * 1024 * 1024; // 5MB

    if (!validTypes.includes(file.type)) {
      alert('Tipo de archivo no válido. Solo se permiten imágenes JPG/PNG');
      return false;
    }

    if (file.size > maxSize) {
      alert('Archivo muy grande. Tamaño máximo: 5MB');
      return false;
    }

    return true;
  }

  /**
   * Generate preview using FileReader
   */
  private generatePreview(file: File): void {
    const reader = new FileReader();
    reader.onload = (e) => {
      this.previewUrl = e.target.result as string;
    };
    reader.readAsDataURL(file);
  }

  /**
   * Get the URL to display (preview or current)
   */
  public getDisplayUrl(): string {
    if (this.previewUrl) return this.previewUrl;
    if (this.currentImageUrl) return this.currentImageUrl;
    return './assets/img/icons/gallery.png';
  }

  /**
   * Trigger file input click
   */
  public triggerFileInput(): void {
    const fileInput = document.getElementById(`file-${this.documentLabel}`) as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  }
}
