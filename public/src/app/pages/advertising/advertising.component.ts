import { Component, OnInit } from '@angular/core';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

@Component({
    selector: 'app-advertising',
    templateUrl: './advertising.component.html',
    styleUrls: ['./advertising.component.css']
})
export class AdvertisingComponent implements OnInit {
    isDownloading = false;

    constructor() { }

    ngOnInit() { }

    /**
     * Descarga un banner en altísima resolución PNG
     * Escala 10x = 3200x4800px (suficiente para impresión profesional)
     */
    async downloadBanner(bannerId: string, fileName: string) {
        if (this.isDownloading) {
            return;
        }

        const bannerElement = document.getElementById(bannerId);

        if (!bannerElement) {
            console.error('Banner no encontrado:', bannerId);
            alert('Error: Banner no encontrado');
            return;
        }

        this.isDownloading = true;
        const button = event?.target as HTMLButtonElement;
        const originalText = button?.innerHTML;

        if (button) {
            button.disabled = true;
            button.innerHTML = '<i class="nc-icon nc-refresh-69"></i> Generando...';
        }

        try {
            // Escala 10x para calidad de impresión profesional (3200x4800px)
            const scale = 10;
            const width = 320;
            const height = 480;

            // Ocultar áreas de seguridad temporalmente para captura limpia
            const beforePseudo = document.createElement('style');
            beforePseudo.innerHTML = `
                .banner::before, .banner::after {
                    display: none !important;
                }
            `;
            document.head.appendChild(beforePseudo);

            // Configuración optimizada para máxima fidelidad
            const canvas = await html2canvas(bannerElement, {
                scale: scale,
                useCORS: true,
                allowTaint: false,
                backgroundColor: null,
                logging: false,
                width: width,
                height: height,
                windowWidth: width,
                windowHeight: height,
                x: 0,
                y: 0,
                scrollX: 0,
                scrollY: 0,
                imageTimeout: 0,
                removeContainer: true
            });

            // Restaurar áreas de seguridad
            document.head.removeChild(beforePseudo);

            // Convertir a PNG con máxima calidad
            canvas.toBlob((blob) => {
                if (blob) {
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.download = `${fileName}-${scale}x-${width*scale}x${height*scale}.png`;
                    link.href = url;
                    link.click();

                    setTimeout(() => {
                        URL.revokeObjectURL(url);
                    }, 100);
                }

                this.isDownloading = false;
                if (button) {
                    button.disabled = false;
                    button.innerHTML = originalText;
                }
            }, 'image/png', 1.0);

        } catch (error) {
            console.error('Error al generar la imagen:', error);
            alert('Error al descargar el banner. Por favor, intenta nuevamente.');

            this.isDownloading = false;
            if (button) {
                button.disabled = false;
                button.innerHTML = originalText;
            }
        }
    }

    /**
     * Descarga el banner como PDF vectorial (mejor calidad para impresión)
     */
    async downloadBannerPDF(bannerId: string, fileName: string) {
        if (this.isDownloading) {
            return;
        }

        const bannerElement = document.getElementById(bannerId);

        if (!bannerElement) {
            console.error('Banner no encontrado:', bannerId);
            alert('Error: Banner no encontrado');
            return;
        }

        this.isDownloading = true;
        const button = event?.target as HTMLButtonElement;
        const originalText = button?.innerHTML;

        if (button) {
            button.disabled = true;
            button.innerHTML = '<i class="nc-icon nc-refresh-69"></i> Generando PDF...';
        }

        try {
            // Ocultar áreas de seguridad
            const beforePseudo = document.createElement('style');
            beforePseudo.innerHTML = `
                .banner::before, .banner::after {
                    display: none !important;
                }
            `;
            document.head.appendChild(beforePseudo);

            // Alta resolución para PDF
            const scale = 8;
            const canvas = await html2canvas(bannerElement, {
                scale: scale,
                useCORS: true,
                allowTaint: false,
                backgroundColor: '#FFFFFF',
                logging: false,
                width: 320,
                height: 480
            });

            // Restaurar áreas de seguridad
            document.head.removeChild(beforePseudo);

            // Crear PDF en tamaño real de impresión (80x120cm en mm)
            // Usamos A4 landscape como base y escalamos
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: [800, 1200], // 80x120cm
                compress: true
            });

            const imgData = canvas.toDataURL('image/jpeg', 0.98);
            pdf.addImage(imgData, 'JPEG', 0, 0, 800, 1200, '', 'FAST');

            pdf.save(`${fileName}-Imprenta.pdf`);

            this.isDownloading = false;
            if (button) {
                button.disabled = false;
                button.innerHTML = originalText;
            }

        } catch (error) {
            console.error('Error al generar PDF:', error);
            alert('Error al descargar el PDF. Por favor, intenta nuevamente.');

            this.isDownloading = false;
            if (button) {
                button.disabled = false;
                button.innerHTML = originalText;
            }
        }
    }
}
