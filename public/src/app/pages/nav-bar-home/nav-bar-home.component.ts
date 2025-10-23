import { Component, HostListener, OnInit } from '@angular/core';

@Component({
  selector: 'app-nav-bar-home',
  templateUrl: './nav-bar-home.component.html',
  styleUrls: ['./nav-bar-home.component.css']
})
export class NavBarHomeComponent implements OnInit {

  public isLogin = false;
  public isMobile = false;
  public isMenuOpen = false;
  public isScrolled = false;

  constructor() { }

  ngOnInit(): void {
    this.checkViewport();
  }

  /**
   * Detecta el scroll para agregar efecto al navbar
   */
  @HostListener('window:scroll', [])
  onWindowScroll() {
    this.isScrolled = window.pageYOffset > 50;
  }

  /**
   * Detecta cambios en el tamaño de la ventana
   */
  @HostListener('window:resize', [])
  onResize() {
    this.checkViewport();

    // Cierra el menú si se cambia a desktop
    if (!this.isMobile && this.isMenuOpen) {
      this.closeMenu();
    }
  }

  /**
   * Verifica si la vista es móvil o desktop
   */
  private checkViewport() {
    if (typeof window !== 'undefined') {
      this.isMobile = window.innerWidth <= 992;
    }
  }

  /**
   * Alterna el estado del menú móvil
   */
  public toggleMenu() {
    this.isMenuOpen = !this.isMenuOpen;

    // Previene el scroll del body cuando el menú está abierto
    if (this.isMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }

  /**
   * Cierra el menú móvil
   */
  public closeMenu() {
    this.isMenuOpen = false;
    document.body.style.overflow = '';
  }

  /**
   * Scroll suave a una sección (Desktop)
   */
  public scrollToSection(sectionId: string) {
    const element = document.getElementById(sectionId);
    if (element) {
      const offset = 80; // Altura del navbar
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  }

  /**
   * Scroll suave a una sección y cierra el menú (Mobile)
   */
  public scrollToSectionMobile(sectionId: string) {
    this.closeMenu();

    // Pequeño delay para que la animación del menú termine antes del scroll
    setTimeout(() => {
      this.scrollToSection(sectionId);
    }, 300);
  }

  /**
   * Cierra el modal de login (si se usa en el futuro)
   */
  public closeModal() {
    this.isLogin = false;
  }
}
