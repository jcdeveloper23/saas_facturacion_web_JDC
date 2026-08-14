import { Timestamp } from '@angular/fire/firestore';
import { BaseDocument } from '../../../core/interfaces/common.interface';

// Stored at: /companies/{companyId}/tm-projects/{projectId}

export type ProjectStatus   = 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled';
export type ProjectPriority = 'low' | 'medium' | 'high' | 'critical';

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planning:  'Planificación',
  active:    'Activo',
  on_hold:   'En Espera',
  completed: 'Completado',
  cancelled: 'Cancelado',
};

export const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
  planning:  'secondary',
  active:    'primary',
  on_hold:   'warning',
  completed: 'success',
  cancelled: 'danger',
};

export const PROJECT_PRIORITY_LABELS: Record<ProjectPriority, string> = {
  low:      'Baja',
  medium:   'Media',
  high:     'Alta',
  critical: 'Crítica',
};

export const PROJECT_PRIORITY_COLORS: Record<ProjectPriority, string> = {
  low:      'secondary',
  medium:   'info',
  high:     'warning',
  critical: 'danger',
};

export interface ProjectMilestone {
  id: string;
  name: string;
  dueDate: Timestamp;
  completed: boolean;
  completedAt?: Timestamp;
}

export interface Project extends BaseDocument {
  name: string;
  description?: string;
  clientId?: string;          // ref a /companies/{companyId}/personas/{id}
  clientName?: string;        // snapshot del nombre
  status: ProjectStatus;
  priority: ProjectPriority;
  startDate: Timestamp;
  dueDate: Timestamp;
  completedAt?: Timestamp;
  memberIds: string[];        // uids de Firebase Auth
  leadId?: string;            // uid del responsable principal
  milestones: ProjectMilestone[];
  tags: string[];
  estimatedHours: number;
  loggedHours: number;        // actualizado por Cloud Function
  completionPct: number;      // 0-100, calculado por Cloud Function
  color?: string;             // hex color para identificación visual, ej: '#6366f1'
  emoji?: string;             // emoji/ícono del proyecto, ej: '🚀'
}

export type ProjectCreateInput = Omit<Project,
  'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy' | 'isActive' | 'loggedHours' | 'completionPct'
>;
