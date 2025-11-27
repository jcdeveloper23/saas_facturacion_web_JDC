import { Component, OnInit } from '@angular/core';
import * as QRCode from 'qrcode';

@Component({
  selector: 'app-download',
  templateUrl: './download.component.html',
  styleUrls: ['./download.component.css']
})
export class DownloadComponent implements OnInit {

  // URLs de las tiendas (actualiza con tus URLs reales)
  public appStoreUrl: string = 'https://apps.apple.com/app/imove'; // Actualizar con URL real
  public playStoreUrl: string = 'https://play.google.com/store/apps/details?id=com.imove'; // Actualizar con URL real

  // URL de esta página de descarga para el QR
  public downloadPageUrl: string = window.location.origin + '/download';

  // Configuración del QR Code
  public showQRCode: boolean = false; // Cambiar a true si quieres mostrar QR
  public qrCodeUrl: string = ''; // URL de la imagen del QR code si la tienes

  // Screenshot de la app
  public hasAppScreenshot: boolean = false; // Cambiar a true cuando tengas la imagen

  // Año actual para el footer
  public currentYear: number = new Date().getFullYear();

  constructor() { }

  ngOnInit(): void {
    // Detectar el sistema operativo del usuario para redirigir automáticamente
    this.detectOS();
  }

  /**
   * Detecta el sistema operativo del usuario y puede redirigir automáticamente
   */
  private detectOS(): void {
    const userAgent = navigator.userAgent || navigator.vendor;

    // Si es iOS, se puede hacer auto-redirect (opcional)
    if (/iPad|iPhone|iPod/.test(userAgent)) {
      console.log('Usuario en iOS');
      // Descomentar para auto-redirect:
      // window.location.href = this.appStoreUrl;
    }

    // Si es Android, se puede hacer auto-redirect (opcional)
    if (/android/i.test(userAgent)) {
      console.log('Usuario en Android');
      // Descomentar para auto-redirect:
      // window.location.href = this.playStoreUrl;
    }
  }

  /**
   * Método para analytics (opcional)
   */
  public trackDownload(store: 'ios' | 'android'): void {
    console.log(`Usuario descargando desde: ${store}`);
    // Aquí puedes agregar código de analytics (Google Analytics, Firebase, etc.)
  }

  /**
   * Genera y descarga un código QR en alta definición con logo - Estilo Minimalista con puntos redondeados
   */
  public async generateAndDownloadQR(): Promise<void> {
    try {
      // Primero generamos los datos del QR
      const qrDataArray = QRCode.create(this.downloadPageUrl, {
        errorCorrectionLevel: 'H'
      }) as any;

      const qrMatrix = qrDataArray.modules;
      const matrixSize = qrMatrix.size;

      // Configuración del canvas
      const canvasSize = 2048;
      const margin = 80; // Margen en píxeles
      const availableSize = canvasSize - (margin * 2);
      const moduleSize = availableSize / matrixSize; // Tamaño de cada punto

      // Crear canvas
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('No se pudo crear el contexto del canvas');
      }

      canvas.width = canvasSize;
      canvas.height = canvasSize;

      // Fondo blanco
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvasSize, canvasSize);

      // Dibujar el QR con círculos/puntos redondeados
      ctx.fillStyle = '#1A1A1A'; // Color gris oscuro

      for (let row = 0; row < matrixSize; row++) {
        for (let col = 0; col < matrixSize; col++) {
          if (qrMatrix.get(row, col)) {
            const x = margin + col * moduleSize + moduleSize / 2;
            const y = margin + row * moduleSize + moduleSize / 2;
            const radius = moduleSize * 0.45; // Círculos con 45% del tamaño del módulo

            // Dibujar círculo
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, 2 * Math.PI);
            ctx.fill();
          }
        }
      }

      // Cargar el logo
      const logo = new Image();
      logo.src = '../../../assets/img/logoIMoveTiendas.png';

      await new Promise((resolve, reject) => {
        logo.onload = resolve;
        logo.onerror = reject;
      });

      // Calcular dimensiones para el cuadrado con borde redondeado
      const logoSize = canvasSize * 0.20; // 20% del tamaño total
      const padding = 50; // Más padding para look minimalista
      const squareSize = logoSize + padding * 2;
      const centerX = canvasSize / 2;
      const centerY = canvasSize / 2;
      const squareX = centerX - squareSize / 2;
      const squareY = centerY - squareSize / 2;
      const borderRadius = 16;

      // Dibujar sombra suave del cuadrado (múltiples capas)
      for (let i = 0; i < 4; i++) {
        const offset = 8 + i * 4;
        const alpha = 0.06 - i * 0.01;

        ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
        this.roundRect(ctx, squareX, squareY + offset, squareSize + i * 6, squareSize + i * 6, borderRadius + i * 2, true, false);
      }

      // Crear gradiente lineal suave para el fondo del logo
      const gradient = ctx.createLinearGradient(
        squareX, squareY,
        squareX + squareSize, squareY + squareSize
      );
      gradient.addColorStop(0, '#FFFFFF');
      gradient.addColorStop(0.5, '#FEFEFE');
      gradient.addColorStop(1, '#F9F9F9');

      // Dibujar cuadrado redondeado con gradiente
      ctx.fillStyle = gradient;
      this.roundRect(ctx, squareX, squareY, squareSize, squareSize, borderRadius, true, false);

      // Agregar borde sutil al cuadrado
      ctx.strokeStyle = 'rgba(255, 107, 53, 0.2)';
      ctx.lineWidth = 4;
      this.roundRect(ctx, squareX + 2, squareY + 2, squareSize - 4, squareSize - 4, borderRadius - 1, false, true);

      // Dibujar sombra suave del logo
      ctx.shadowColor = 'rgba(0, 0, 0, 0.12)';
      ctx.shadowBlur = 15;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 4;

      // Dibujar el logo en el centro
      const logoX = centerX - logoSize / 2;
      const logoY = centerY - logoSize / 2;
      ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);

      // Resetear sombra
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      // Convertir canvas a blob y descargar
      canvas.toBlob((blob) => {
        if (!blob) {
          throw new Error('Error al generar la imagen');
        }

        const url = URL.createObjectURL(blob);
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = `iMove-QR-Rounded-HD-${Date.now()}.png`;

        // Simular click para descargar
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);

        // Limpiar URL temporal
        URL.revokeObjectURL(url);

        console.log('QR Code con puntos redondeados y logo descargado exitosamente');
      }, 'image/png', 1.0);

    } catch (error) {
      console.error('Error al generar el QR Code:', error);
      alert('Error al generar el código QR. Por favor intenta de nuevo.');
    }
  }

  /**
   * Helper para dibujar rectángulos redondeados
   */
  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    fill: boolean,
    stroke: boolean
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();

    if (fill) {
      ctx.fill();
    }
    if (stroke) {
      ctx.stroke();
    }
  }

}
