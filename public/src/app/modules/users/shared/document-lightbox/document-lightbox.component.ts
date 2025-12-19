import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';

/**
 * Reusable lightbox component for viewing and verifying documents
 * Extracted from users modal for better reusability and separation of concerns
 */
@Component({
  selector: 'app-document-lightbox',
  templateUrl: './document-lightbox.component.html',
  styleUrls: ['./document-lightbox.component.css']
})
export class DocumentLightboxComponent implements OnInit {

  // Inputs
  @Input() isOpen: boolean = false;
  @Input() document: any = null; // Document object with url, label, type, verified, etc.
  @Input() imageUrl: string = '';

  // Outputs
  @Output() onClose = new EventEmitter<void>();
  @Output() onVerify = new EventEmitter<void>();
  @Output() onReject = new EventEmitter<string>(); // Emits rejection reason

  // Zoom control
  public zoomLevel: number = 1;

  // Rejection logic
  public isRejecting: boolean = false;
  public rejectionReason: string = '';
  public predefinedReasons: string[] = [
    'Documento ilegible o borroso',
    'El documento está vencido',
    'Los datos no coinciden',
    'Documento incompleto',
    'No es el documento solicitado'
  ];

  constructor() { }

  ngOnInit(): void {
  }

  /**
   * Close lightbox
   */
  public closeLightbox(): void {
    this.isOpen = false;
    this.zoomLevel = 1;
    this.cancelRejection();
    this.onClose.emit();
  }

  /**
   * Zoom In
   */
  public zoomIn(event?: any): void {
    if (event) event.stopPropagation();
    this.zoomLevel += 0.25;
  }

  /**
   * Zoom Out
   */
  public zoomOut(event?: any): void {
    if (event) event.stopPropagation();
    if (this.zoomLevel > 0.5) {
      this.zoomLevel -= 0.25;
    }
  }

  /**
   * Start rejection process (show inline form)
   */
  public rejectDocument(): void {
    this.isRejecting = true;
    this.rejectionReason = '';
  }

  /**
   * Cancel rejection process
   */
  public cancelRejection(): void {
    this.isRejecting = false;
    this.rejectionReason = '';
  }

  /**
   * Set rejection reason from predefined list
   */
  public setRejectionReason(reason: string): void {
    this.rejectionReason = reason;
  }

  /**
   * Confirm rejection
   */
  public confirmRejection(): void {
    if (!this.rejectionReason || this.rejectionReason.trim().length === 0) {
      // Emit error or show notification
      return;
    }

    this.onReject.emit(this.rejectionReason);
    this.cancelRejection();
  }

  /**
   * Verify document
   */
  public verifyDocument(): void {
    this.onVerify.emit();
  }

  /**
   * Get image URL for lightbox
   */
  public getLightboxImage(): string {
    return this.imageUrl || (this.document ? this.document.url : '');
  }
}
