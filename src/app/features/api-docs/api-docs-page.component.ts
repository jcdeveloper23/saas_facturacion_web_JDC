import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-api-docs-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './api-docs-page.component.html',
  styleUrl: './api-docs-page.component.scss'
})
export class ApiDocsPageComponent implements OnInit, OnDestroy {
  readonly isLoading = signal(true);
  readonly hasError = signal(false);

  private readonly docsUrl = 'https://us-central1-facturasproec.cloudfunctions.net/serveApiDocs';

  ngOnInit(): void {
    this.loadSwaggerUi();
  }

  ngOnDestroy(): void {
    const container = document.getElementById('swagger-ui');
    if (container) container.innerHTML = '';
    // Remove injected scripts/links to avoid duplicates on re-enter
    document.getElementById('swagger-ui-bundle-script')?.remove();
    document.getElementById('swagger-ui-css')?.remove();
  }

  private loadSwaggerUi(): void {
    const win = window as any;

    const injectCss = (): void => {
      if (!document.getElementById('swagger-ui-css')) {
        const link = document.createElement('link');
        link.id = 'swagger-ui-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/swagger-ui-dist@5/swagger-ui.css';
        document.head.appendChild(link);
      }
    };

    const initSwagger = (): void => {
      this.isLoading.set(false);
      win.SwaggerUIBundle({
        url: this.docsUrl,
        dom_id: '#swagger-ui',
        presets: [
          win.SwaggerUIBundle.presets.apis,
          win.SwaggerUIBundle.SwaggerUIStandalonePreset
        ],
        layout: 'BaseLayout',
        deepLinking: true,
        filter: true,
        tryItOutEnabled: false,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      });
    };

    injectCss();

    if (win.SwaggerUIBundle) {
      initSwagger();
      return;
    }

    const script = document.createElement('script');
    script.id = 'swagger-ui-bundle-script';
    script.src = 'https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js';
    script.onload = () => initSwagger();
    script.onerror = () => {
      this.isLoading.set(false);
      this.hasError.set(true);
    };
    document.head.appendChild(script);
  }
}
