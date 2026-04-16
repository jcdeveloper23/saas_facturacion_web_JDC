import { Timestamp } from '@angular/fire/firestore';
import { BaseDocument } from '../../../core/interfaces/common.interface';

// Stored at: /companies/{companyId}/tm-members/{memberId}
// Vincula un uid de Firebase Auth con metadata del equipo.

export type MemberRole   = 'developer' | 'qa' | 'support' | 'designer' | 'devops' | 'pm' | 'analyst';
export type MemberStatus = 'active' | 'on_leave' | 'inactive';

export const MEMBER_ROLE_LABELS: Record<MemberRole, string> = {
  developer: 'Desarrollador',
  qa:        'QA / Testing',
  support:   'Soporte',
  designer:  'Diseñador',
  devops:    'DevOps',
  pm:        'Project Manager',
  analyst:   'Analista',
};

export const MEMBER_ROLE_COLORS: Record<MemberRole, string> = {
  developer: 'primary',
  qa:        'info',
  support:   'success',
  designer:  'warning',
  devops:    'secondary',
  pm:        'dark',
  analyst:   'light',
};

export const MEMBER_STATUS_LABELS: Record<MemberStatus, string> = {
  active:   'Activo',
  on_leave: 'Con Permiso',
  inactive: 'Inactivo',
};

export interface TeamMember extends BaseDocument {
  userId: string;                 // uid Firebase Auth — campo único
  displayName: string;
  email: string;
  role: MemberRole;
  specialties: string[];          // ['Angular', 'Firebase', 'Node.js']
  status: MemberStatus;
  weeklyCapacityHours: number;    // horas disponibles por semana (default 40)
  activeProjectIds: string[];     // proyectos activos asignados
  avatarUrl?: string;
  phone?: string;
  hireDate?: Timestamp;
  position?: string;              // cargo/título — referencia al catálogo tm-positions
  personaId?: string;             // referencia al documento /personas/{id}
}

export type TeamMemberCreateInput = Omit<TeamMember,
  'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy' | 'isActive'
>;
