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

// ─── Department / Departamento ───────────────────────────────────────────────
// Stored at: /companies/{companyId}/tm-departments/{id}
// Entidad de primera clase compartida con el futuro módulo de RRHH.

export interface TmDepartment {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}

// ─── Position / Cargo ─────────────────────────────────────────────────────────
// Stored at: /companies/{companyId}/tm-positions/{id}
// Sirve también como catálogo de cargos para el módulo de RRHH.
// position.department almacena el *nombre* del departamento (denormalizado).

export interface TmPosition {
  id: string;
  name: string;
  department?: string;  // nombre del departamento (ref: tm-departments.name)
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}
