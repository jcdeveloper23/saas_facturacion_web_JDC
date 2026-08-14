import { Timestamp } from '@angular/fire/firestore';

// ─── Ecuador Educational Model (MINEDUC) ──────────────────────────────────────

export type EduSubLevel =
  | 'inicial'
  | 'preparatoria'
  | 'elemental'
  | 'media'
  | 'superior_egb'
  | 'bachillerato';

export const EDU_SUB_LEVEL_LABELS: Record<EduSubLevel, string> = {
  inicial:      'Inicial',
  preparatoria: 'Preparatoria',
  elemental:    'Elemental',
  media:        'Media',
  superior_egb: 'Superior EGB',
  bachillerato: 'Bachillerato'
};

export const EDU_SUB_LEVEL_COLORS: Record<EduSubLevel, string> = {
  inicial:      'info',
  preparatoria: 'primary',
  elemental:    'success',
  media:        'warning',
  superior_egb: 'danger',
  bachillerato: 'dark'
};

export interface EduLevelTemplate {
  subnivel:  EduSubLevel;
  name:      string;
  shortName: string;
  level:     number;
}

export const ECUADOR_EDU_LEVELS: EduLevelTemplate[] = [
  { subnivel: 'inicial',      name: 'Inicial 1',               shortName: 'Ini 1',    level: 1  },
  { subnivel: 'inicial',      name: 'Inicial 2',               shortName: 'Ini 2',    level: 2  },
  { subnivel: 'preparatoria', name: 'Primero de Básica',        shortName: '1ro EGB',  level: 3  },
  { subnivel: 'elemental',    name: 'Segundo de Básica',        shortName: '2do EGB',  level: 4  },
  { subnivel: 'elemental',    name: 'Tercero de Básica',        shortName: '3ro EGB',  level: 5  },
  { subnivel: 'elemental',    name: 'Cuarto de Básica',         shortName: '4to EGB',  level: 6  },
  { subnivel: 'media',        name: 'Quinto de Básica',         shortName: '5to EGB',  level: 7  },
  { subnivel: 'media',        name: 'Sexto de Básica',          shortName: '6to EGB',  level: 8  },
  { subnivel: 'media',        name: 'Séptimo de Básica',        shortName: '7mo EGB',  level: 9  },
  { subnivel: 'superior_egb', name: 'Octavo de Básica',         shortName: '8vo EGB',  level: 10 },
  { subnivel: 'superior_egb', name: 'Noveno de Básica',         shortName: '9no EGB',  level: 11 },
  { subnivel: 'superior_egb', name: 'Décimo de Básica',         shortName: '10mo EGB', level: 12 },
  { subnivel: 'bachillerato', name: 'Primero de Bachillerato',  shortName: '1ro BGU',  level: 13 },
  { subnivel: 'bachillerato', name: 'Segundo de Bachillerato',  shortName: '2do BGU',  level: 14 },
  { subnivel: 'bachillerato', name: 'Tercero de Bachillerato',  shortName: '3ro BGU',  level: 15 },
];

// ─── Schedule ─────────────────────────────────────────────────────────────────

export type SchoolScheduleType = 'morning' | 'afternoon' | 'full';

export const SCHEDULE_TYPE_LABELS: Record<SchoolScheduleType, string> = {
  morning:   'Matutina',
  afternoon: 'Vespertina',
  full:      'Completa'
};

/** Franja horaria del recreo por jornada */
export interface SchoolSchedule {
  name: string;          // "Recreo Matutino"
  type: SchoolScheduleType;
  breakStart: string;    // "10:00" — hora de inicio del recreo (HH:mm)
  breakDuration: number; // minutos de duración (ej. 20)
  days: number[];        // [1,2,3,4,5] = lunes a viernes (ISO weekday)
}

// ─── Bar Config ───────────────────────────────────────────────────────────────

export interface SchoolBarConfig {
  maxWalletBalance: number;       // saldo máximo permitido por alumno en USD
  dailySpendLimit?: number;       // límite de gasto diario por defecto (USD)
  weeklySpendLimit?: number;      // límite de gasto semanal (USD)
  emergencyCreditLimit?: number;  // crédito de emergencia permitido (saldo negativo máx, USD)
  orderCutoffHour: number;        // hora de corte para pedidos anticipados (ej. 7 = 07:00)
  orderCutoffMinute: number;      // minuto de corte (ej. 0 = :00)
  allowClassroomDelivery: boolean;
  deliveryFee?: number;           // costo adicional por entrega en aula (USD)
  acceptedPayments: string[];     // ['wallet'] o también ['wallet', 'cash']
  defaultWarehouseCode?: string;  // almacén del bar — usado para decrementar stock al entregar
}

// ─── Bar Settings ─────────────────────────────────────────────────────────────
// Stored at: /companies/{companyId}/settings/school_bar (documento único por empresa)
//
// La empresa ES la institución educativa — no existe entidad SchoolInstitution separada.
// Solo se almacenan campos exclusivos del bar (AMIE, período, schedules, barConfig).
// El nombre, dirección y logo de la institución se leen del documento de la empresa.

export interface SchoolBarSettings {
  amieCode:      string;        // Código AMIE del MINEDUC
  currentPeriod: string;        // "2025-2026"
  barName:       string;        // Nombre del bar (puede diferir del nombre de la empresa)
  schedules:     SchoolSchedule[];
  barConfig:     SchoolBarConfig;
  state:         boolean;
  updatedAt:     Timestamp;
}

// ─── Grade (Grado / Sección) ──────────────────────────────────────────────────
// Stored at: /companies/{companyId}/school_grades/{gradeId}

export interface SchoolGrade {
  id: string;
  companyId: string;            // siempre === el companyId del tenant (antes institutionId)
  subnivel?: EduSubLevel;       // subnivel educativo MINEDUC
  name: string;                 // "Tercero de Básica"
  shortName: string;            // "3ro EGB"
  level: number;                // 1–15 (para ordenar)
  section: string;              // "A", "B", "C", "Única"
  schedule: SchoolScheduleType;
  teacherId?: string;
  teacherName?: string;
  studentCount: number;         // denormalizado
  state: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
