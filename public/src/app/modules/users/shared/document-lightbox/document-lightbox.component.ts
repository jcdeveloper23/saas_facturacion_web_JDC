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
  @Input() userName: string = ''; // Full name of the user

  // Outputs
  @Output() onClose = new EventEmitter<void>();
  @Output() onVerify = new EventEmitter<void>();
  @Output() onReject = new EventEmitter<any>(); // Emits { reason, customNotification: { title, body } }

  // Zoom control
  public zoomLevel: number = 1;

  // Rejection logic
  public isRejecting: boolean = false;
  public rejectionReason: string = '';
  public notificationTitle: string = '';
  public notificationBody: string = '';
  public predefinedReasons: string[] = [
    'Imagen borrosa o ilegible',
    'Documento cortado o incompleto',
    'Fecha de vencimiento expirada',
    'Nombre no coincide con el perfil',
    'Documento no corresponde a lo solicitado',
    'Falta la parte posterior del documento',
    'Reflejo de luz impide ver los datos',
    'Documento parece estar alterado o editado',
    'Foto de perfil: Rostro no es visible o está cubierto',
    'Foto de perfil: No es una foto real de la persona',
    'Foto de perfil: Demasiada obscura o mala iluminación',
    'Foto de perfil: Contiene a más de una persona'
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
    this.updateNotificationPreview('(selecciona un motivo)');
  }

  /**
   * Cancel rejection process
   */
  public cancelRejection(): void {
    this.isRejecting = false;
    this.rejectionReason = '';
    this.notificationTitle = '';
    this.notificationBody = '';
  }

  /**
   * Extract first name from full name
   */
  private getFirstName(): string {
    if (!this.userName) return 'Usuario';
    return this.userName.split(' ')[0];
  }

  /**
   * Update notification preview based on reason
   */
  public updateNotificationPreview(reason: string): void {
    const docLabel = this.document ? this.document.label : 'Documento';
    const firstName = this.getFirstName();

    this.notificationTitle = `🚨 Documento Rechazado: ${docLabel}`;
    this.notificationBody = `Hola ${firstName}, tu ${docLabel} ha sido rechazado. MOTIVO: ${reason}. Por favor, sube una nueva versión válida.`;
  }

  /**
   * Set rejection reason from predefined list
   */
  public setRejectionReason(reason: string): void {
    this.rejectionReason = reason;
    this.updateNotificationPreview(reason);
  }

  /**
   * Confirm rejection
   */
  public confirmRejection(): void {
    if (!this.rejectionReason || this.rejectionReason.trim().length === 0) {
      return;
    }

    this.onReject.emit({
      reason: this.rejectionReason,
      customNotification: {
        title: this.notificationTitle,
        body: this.notificationBody
      }
    });
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
