import { Timestamp } from '@angular/fire/firestore';

// ─── Specialty ────────────────────────────────────────────────────────────────
// Stored at: /companies/{companyId}/tm-specialties/{id}

export interface TmSpecialty {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}

// ─── Position / Cargo ─────────────────────────────────────────────────────────
// Stored at: /companies/{companyId}/tm-positions/{id}
// Sirve también como catálogo de cargos para el módulo de RRHH.

export interface TmPosition {
  id: string;
  name: string;
  department?: string;  // agrupador opcional (ej: "Tecnología", "Calidad")
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}
