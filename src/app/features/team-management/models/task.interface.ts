import { Timestamp } from '@angular/fire/firestore';
import { BaseDocument } from '../../../core/interfaces/common.interface';

// Stored at: /companies/{companyId}/tm-tasks/{taskId}

export type TaskStatus   = 'backlog' | 'pending' | 'in_progress' | 'in_qa' | 'blocked' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';
export type TaskType     = 'feature' | 'bug' | 'improvement' | 'research' | 'maintenance';

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  backlog:     'Backlog',
  pending:     'Pendiente',
  in_progress: 'En Desarrollo',
  in_qa:       'En QA',
  blocked:     'Bloqueado',
  done:        'Finalizado',
};

export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  backlog:     'secondary',
  pending:     'light',
  in_progress: 'primary',
  in_qa:       'info',
  blocked:     'danger',
  done:        'success',
};

// Orden de columnas para el tablero Kanban
export const TASK_KANBAN_COLUMNS: TaskStatus[] = [
  'backlog', 'pending', 'in_progress', 'in_qa', 'blocked', 'done'
];

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low:      'Baja',
  medium:   'Media',
  high:     'Alta',
  critical: 'Crítica',
};

export const TASK_PRIORITY_COLORS: Record<TaskPriority, string> = {
  low:      'secondary',
  medium:   'info',
  high:     'warning',
  critical: 'danger',
};

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  feature:     'Funcionalidad',
  bug:         'Bug',
  improvement: 'Mejora',
  research:    'Investigación',
  maintenance: 'Mantenimiento',
};

export interface TaskComment {
  id: string;
  authorId: string;        // uid Firebase Auth
  authorName: string;      // snapshot
  content: string;
  createdAt: Timestamp;
}

export interface Task extends BaseDocument {
  projectId: string;
  projectName: string;     // snapshot para queries sin join
  title: string;
  description?: string;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeIds: string[];   // uids Firebase Auth
  reporterId: string;
  dueDate?: Timestamp;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  estimatedHours: number;
  loggedHours: number;     // suma de timesheets vinculados (Cloud Function)
  tags: string[];
  requestId?: string;      // si vino de una solicitud de cliente
  blockedReason?: string;  // solo cuando status === 'blocked'
  comments: TaskComment[];
}

export type TaskCreateInput = Omit<Task,
  'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy' | 'isActive' | 'loggedHours'
>;
