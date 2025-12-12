import { Component, OnInit, HostListener, ViewEncapsulation } from '@angular/core';
import { TutorialService } from '../../services/tutorial/tutorial.service';
import { TutorialSection, Quiz } from '../../interfaces/tutorial';
import { log } from 'console';

@Component({
  selector: 'app-driver-tutorial',
  templateUrl: './driver-tutorial.component.html',
  styleUrls: ['./driver-tutorial.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class DriverTutorialComponent implements OnInit {
  searchTerm: string = '';
  activeSection: string = 'introduccion';
  sidebarOpen: boolean = false;
  readingProgress: number = 0;
  showBackToTop: boolean = false;

  // Quiz State
  showQuizModal: boolean = false;
  currentQuizSectionId: string | null = null;
  currentQuiz: Quiz | null = null;
  quizError: boolean = false;
  quizSuccess: boolean = false;

  sections: TutorialSection[] = [];

  // Hardcoded data for seeding/fallback
  public defaultSections: TutorialSection[] = [
    {
      id: 'introduccion',
      title: 'Introducción',
      icon: 'info-circle',
      locked: false,
      active: true,
      order: 1,
      completed: false,
      quiz: {
        question: '¿Cuál es el principal requisito de ubicación para usar iMove Driver?',
        options: [
          'Tener el GPS activado',
          'Tener conexión WiFi',
          'Vivir en Caracas',
          'Tener saldo positivo'
        ],
        correctAnswerIndex: 0
      },
      subsections: [
        { id: 'que-es', title: '¿Qué es iMove Driver?' },
        { id: 'requisitos', title: 'Requisitos del Sistema' }
      ]
    },
    {
      id: 'instalacion',
      title: 'Instalación y Registro',
      icon: 'download',
      locked: true,
      active: true,
      order: 2,
      completed: false,
      quiz: {
        question: '¿Qué documento es obligatorio para completar el registro de conductor?',
        options: [
          'Partida de nacimiento',
          'Documento de identidad (Cédula o Pasaporte)',
          'Carta de residencia',
          'Referencia bancaria'
        ],
        correctAnswerIndex: 1
      },
      subsections: [
        { id: 'descarga', title: 'Descarga de la Aplicación' },
        { id: 'registro', title: 'Proceso de Registro' },
        { id: 'verificacion', title: 'Verificación de Cuenta' }
      ]
    },
    {
      id: 'configuracion',
      title: 'Configuración Inicial',
      icon: 'cog',
      locked: true,
      active: true,
      order: 3,
      completed: false,
      quiz: {
        question: '¿Qué configuración de ubicación es necesaria para el correcto funcionamiento?',
        options: [
          'Solo al usar la app',
          'Siempre / Permitir siempre',
          'Nunca',
          'Preguntar la próxima vez'
        ],
        correctAnswerIndex: 1
      },
      subsections: [
        { id: 'primer-inicio', title: 'Primer Inicio de Sesión' },
        { id: 'permisos', title: 'Permisos Esenciales' },
        { id: 'gps', title: 'Configuración del GPS' },
        { id: 'modo-conductor', title: 'Activación del Modo Conductor' }
      ]
    },
    {
      id: 'pantalla-principal',
      title: 'Pantalla Principal',
      icon: 'map',
      locked: true,
      active: true,
      order: 4,
      completed: false,
      quiz: {
        question: '¿Qué indica el punto azul con tu foto en el mapa?',
        options: [
          'La ubicación del pasajero',
          'Tu ubicación actual',
          'Una zona de alta demanda',
          'Un otro conductor'
        ],
        correctAnswerIndex: 1
      },
      subsections: [
        { id: 'elementos-pantalla', title: 'Elementos de la Pantalla' },
        { id: 'navegacion-mapa', title: 'Navegación por el Mapa' },
        { id: 'tema', title: 'Cambio de Tema' }
      ]
    },
    {
      id: 'gestion-viajes',
      title: 'Recibir y Gestionar Viajes',
      icon: 'car',
      locked: true,
      active: true,
      order: 5,
      completed: false,
      quiz: {
        question: '¿Cuánto tiempo máximo se recomienda esperar al pasajero antes de cancelar?',
        options: [
          '2 minutos',
          '5 minutos',
          '10 minutos',
          '15 minutos'
        ],
        correctAnswerIndex: 1
      },
      subsections: [
        { id: 'recibir-solicitudes', title: 'Recibir Solicitudes' },
        { id: 'gestionar-solicitudes', title: 'Gestionar Solicitudes' },
        { id: 'estados-viaje', title: 'Estados del Viaje' },
        { id: 'cancelar-viaje', title: 'Cancelar un Viaje' },
        { id: 'chat-navegacion', title: 'Chat y Navegación' }
      ]
    },
    {
      id: 'gestion-vehiculos',
      title: 'Gestión de Vehículos',
      icon: 'car-side',
      locked: true,
      active: true,
      order: 6,
      completed: false,
      quiz: {
        question: '¿Cuántos vehículos puedes tener activos para trabajar simultáneamente?',
        options: [
          'Dos',
          'Tres',
          'Solo uno',
          'Ilimitados'
        ],
        correctAnswerIndex: 2
      },
      subsections: [
        { id: 'ver-vehiculos', title: 'Ver y Administrar' },
        { id: 'agregar-vehiculo', title: 'Agregar Nuevo Vehículo' },
        { id: 'cambiar-vehiculo', title: 'Cambiar Vehículo Activo' },
        { id: 'actualizar-docs', title: 'Actualizar Documentos' }
      ]
    },
    {
      id: 'billetera',
      title: 'Billetera y Ganancias',
      icon: 'wallet',
      locked: true,
      active: true,
      order: 7,
      completed: false,
      quiz: {
        question: '¿Cuánto tiempo suele tardar un retiro por pago móvil?',
        options: [
          '24 horas',
          '1-3 días hábiles',
          '5-30 minutos',
          'Instantáneo'
        ],
        correctAnswerIndex: 2
      },
      subsections: [
        { id: 'acceder-billetera', title: 'Acceder a tu Billetera' },
        { id: 'retirar-dinero', title: 'Retirar Dinero' },
        { id: 'ganancias', title: 'Ganancias' }
      ]
    },
    {
      id: 'perfil',
      title: 'Perfil del Conductor',
      icon: 'user',
      locked: true,
      active: true,
      order: 8,
      completed: false,
      quiz: {
        question: '¿Qué acción es necesaria si cambias tu documento de identidad en el perfil?',
        options: [
          'Ninguna',
          'Verificación del equipo iMove',
          'Pagar una tasa',
          'Reiniciar el teléfono'
        ],
        correctAnswerIndex: 1
      },
      subsections: [
        { id: 'info-personal', title: 'Información Personal' },
        { id: 'calificacion', title: 'Calificación y Estadísticas' },
        { id: 'documentos-perfil', title: 'Documentos' },
        { id: 'config-perfil', title: 'Configuración' }
      ]
    },
    {
      id: 'solicitar-viajes',
      title: 'Solicitar Viajes',
      icon: 'taxi',
      locked: true,
      active: true,
      order: 9,
      completed: false,
      quiz: {
        question: '¿Puedes solicitar viajes como pasajero desde la app de conductor?',
        options: [
          'No, necesitas otra app',
          'Sí, desde el menú lateral',
          'Solo si cierras sesión',
          'Solo en días festivos'
        ],
        correctAnswerIndex: 1
      },
      subsections: [
        { id: 'solicitar', title: 'Solicitar un Viaje' },
        { id: 'durante-viaje', title: 'Durante el Viaje' },
        { id: 'cancelacion-pasajero', title: 'Cancelación' }
      ]
    },
    {
      id: 'historial',
      title: 'Historial y Estadísticas',
      icon: 'history',
      locked: true,
      active: true,
      order: 10,
      completed: false,
      quiz: {
        question: '¿Qué información NO se muestra en el historial de un viaje?',
        options: [
          'Ganancia',
          'Número de teléfono del pasajero',
          'Ruta recorrida',
          'Fecha y hora'
        ],
        correctAnswerIndex: 1
      },
      subsections: [
        { id: 'historial-viajes', title: 'Historial de Viajes' },
        { id: 'estadisticas', title: 'Estadísticas' }
      ]
    },
    {
      id: 'soporte',
      title: 'Soporte y Ayuda',
      icon: 'headset',
      locked: true,
      active: true,
      order: 11,
      completed: false,
      quiz: {
        question: '¿Cuál es el horario de atención del Chat en Vivo?',
        options: [
          '24/7',
          'Lunes a Viernes 8am - 8pm',
          'Solo fines de semana',
          '9am - 5pm'
        ],
        correctAnswerIndex: 1
      },
      subsections: [
        { id: 'chat-soporte', title: 'Chat con Pasajeros' },
        { id: 'contactar-soporte', title: 'Contactar Soporte' },
        { id: 'reportar', title: 'Reportar Problemas' }
      ]
    },
    {
      id: 'ajustes',
      title: 'Configuración y Ajustes',
      icon: 'sliders-h',
      locked: true,
      active: true,
      order: 12,
      completed: false,
      quiz: {
        question: '¿Cuántos contactos de emergencia puedes agregar?',
        options: [
          'Uno',
          'Cinco',
          'Hasta 3',
          'Ilimitados'
        ],
        correctAnswerIndex: 2
      },
      subsections: [
        { id: 'general', title: 'General' },
        { id: 'privacidad', title: 'Privacidad y Seguridad' },
        { id: 'notificaciones', title: 'Notificaciones' },
        { id: 'acerca-de', title: 'Acerca de' }
      ]
    },
    {
      id: 'solucion-problemas',
      title: 'Solución de Problemas',
      icon: 'tools',
      locked: true,
      active: true,
      order: 13,
      completed: false,
      quiz: {
        question: 'Si el mapa no carga, ¿qué puedes intentar?',
        options: [
          'Comprar un nuevo teléfono',
          'Llamar al pasajero',
          'Limpiar caché y verificar internet',
          'Borrar tu cuenta'
        ],
        correctAnswerIndex: 2
      },
      subsections: [
        { id: 'problemas-comunes', title: 'Problemas Comunes' },
        { id: 'problemas-pago', title: 'Problemas de Pago' },
        { id: 'problemas-viajes', title: 'Problemas con Viajes' },
        { id: 'contactar-soporte-tec', title: 'Contactar Soporte' }
      ]
    },
    {
      id: 'preguntas-frecuentes',
      title: 'Preguntas Frecuentes',
      icon: 'question-circle',
      locked: true,
      active: true,
      order: 14,
      completed: false,
      quiz: {
        question: '¿Cuándo se acredita el pago a la Billetera?',
        options: [
          'Al día siguiente',
          'Semanalmente',
          'Instantáneamente al finalizar',
          'A fin de mes'
        ],
        correctAnswerIndex: 2
      },
      subsections: [
        { id: 'faq-pagos', title: 'Pagos y Ganancias' },
        { id: 'faq-viajes', title: 'Viajes' }
      ]
    }
  ];

  constructor(private tutorialService: TutorialService) { }

  ngOnInit(): void {
    this.updateProgress();
    this.tutorialService.getActiveSections().subscribe(
      (data) => {
        console.log(JSON.stringify(data, null, 2));
        if (data && data.length > 0) {
          this.sections = data;
          // Maintain unlocked state based on logic or local storage if needed
          // For now, respect DB 'locked' status, but we could chain unlocking logic
          this.checkUnlockStatus();
        } else {
          // Fallback if DB is empty
          // this.sections = this.defaultSections;
        }
      },
      error => {
        console.error('Error fetching tutorial sections', error);
        this.sections = this.defaultSections;
      }
    );
  }

  // Self-repair/Unlock logic: ensure at least first section is unlocked
  checkUnlockStatus() {
    if (this.sections.length > 0 && this.sections[0].locked) {
      this.sections[0].locked = false;
    }
  }

  // Developer tool to migrate data to Firestore (trigger manually if needed)
  public migrateData() {
    this.defaultSections.forEach(section => {
      this.tutorialService.createSection(section)
        .then(() => console.log(`Sección ${section.title} migrada.`))
        .catch(err => console.error(`Error migrando ${section.title}`, err));
    });
  }

  @HostListener('window:scroll', ['$event'])
  onScroll(): void {
    this.updateProgress();
    this.updateActiveSection();
    this.showBackToTop = window.pageYOffset > 300;
  }

  updateProgress(): void {
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight - windowHeight;
    const scrollTop = window.pageYOffset;
    this.readingProgress = (scrollTop / documentHeight) * 100;
  }

  updateActiveSection(): void {
    const sections = document.querySelectorAll('.tutorial-section');
    sections.forEach((section: any) => {
      const rect = section.getBoundingClientRect();
      if (rect.top >= 0 && rect.top <= 200) {
        this.activeSection = section.id;
      }
    });
  }

  scrollToSection(sectionId: string): void {
    const sectionIndex = this.sections.findIndex(s => s.id === sectionId);

    if (sectionIndex !== -1 && this.sections[sectionIndex].locked) {
      return;
    }

    const element = document.getElementById(sectionId);
    if (element) {
      const yOffset = -80;
      const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
      this.activeSection = sectionId;
    }
  }

  scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }

  filterSections(): TutorialSection[] {
    if (!this.searchTerm) {
      return this.sections;
    }
    const term = this.searchTerm.toLowerCase();
    return this.sections.filter(section =>
      section.title.toLowerCase().includes(term) ||
      section.subsections?.some(sub => sub.title.toLowerCase().includes(term))
    );
  }

  // Quiz Logic
  openQuiz(sectionId: string): void {
    const section = this.sections.find(s => s.id === sectionId);
    if (section && section.quiz && !section.completed) {
      this.currentQuiz = section.quiz;
      this.currentQuizSectionId = sectionId;
      this.showQuizModal = true;
      this.quizError = false;
      this.quizSuccess = false;
    } else if (section && section.completed) {
      // If already completed, maybe just scroll to next?
      // Or do nothing
    }
  }

  closeQuiz(): void {
    this.showQuizModal = false;
    this.currentQuiz = null;
    this.currentQuizSectionId = null;
  }

  submitQuiz(optionIndex: number): void {
    if (!this.currentQuiz || !this.currentQuizSectionId) return;

    if (optionIndex === this.currentQuiz.correctAnswerIndex) {
      this.quizSuccess = true;
      this.quizError = false;

      // Delay to show success animation/message before closing
      setTimeout(() => {
        this.completeSection(this.currentQuizSectionId!);
        this.closeQuiz();
      }, 1500);
    } else {
      this.quizError = true;
      this.quizSuccess = false;
    }
  }

  completeSection(sectionId: string): void {
    const currentIndex = this.sections.findIndex(s => s.id === sectionId);
    if (currentIndex !== -1) {
      this.sections[currentIndex].completed = true;

      // Unlock next section
      if (currentIndex + 1 < this.sections.length) {
        this.sections[currentIndex + 1].locked = false;
      }
    }
  }
}

