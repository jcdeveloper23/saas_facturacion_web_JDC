import { Timestamp } from '@angular/fire/firestore';
import { BaseDocument } from '../../../core/interfaces/common.interface';

// Stored at: /companies/{companyId}/tm-requests/{requestId}

export type RequestType    = 'bug' | 'feature' | 'change' | 'support' | 'consulting';
export type RequestStatus  = 'new' | 'triaged' | 'in_progress' | 'resolved' | 'rejected' | 'on_hold';
export type RequestUrgency = 'low' | 'medium' | 'high' | 'critical';

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  new:         'Nueva',
  triaged:     'Evaluada',
  in_progress: 'En Proceso',
  resolved:    'Resuelta',
  rejected:    'Rechazada',
  on_hold:     'En Espera',
};

export const REQUEST_STATUS_COLORS: Record<RequestStatus, string> = {
  new:         'info',
  triaged:     'warning',
  in_progress: 'primary',
  resolved:    'success',
  rejected:    'danger',
  on_hold:     'secondary',
};

export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  bug:        'Bug / Error',
  feature:    'Nueva Funcionalidad',
  change:     'Cambio / Mejora',
  support:    'Soporte',
  consulting: 'Consultoría',
};

export const REQUEST_URGENCY_COLORS: Record<RequestUrgency, string> = {
  low:      'secondary',
  medium:   'info',
  high:     'warning',
  critical: 'danger',
};

export interface RequestStatusChange {
  fromStatus: RequestStatus;
  toStatus: RequestStatus;
  changedBy: string;
  changedByName: string;
  changedAt: Timestamp;
  notes?: string;
}

export interface ClientRequest extends BaseDocument {
  title: string;
  description: string;
  type: RequestType;
  urgency: RequestUrgency;
  status: RequestStatus;
  clientId: string;
  clientName: string;      // snapshot
  projectId?: string;
  projectName?: string;
  taskId?: string;         // tarea derivada de esta solicitud
  assignedToId?: string;
  assignedToName?: string;
  estimatedHours?: number;
  agreedDate?: Timestamp;  // fecha comprometida con el cliente
  resolvedAt?: Timestamp;
  rejectedReason?: string;
  statusHistory: RequestStatusChange[];
  attachments: string[];   // Storage URLs
}

export type RequestCreateInput = Omit<ClientRequest,
  'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy' | 'isActive' | 'statusHistory' | 'resolvedAt'
>;
