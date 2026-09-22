import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { CompanyUsersService } from './company-users.service';
import { DocumentSeries } from '../../features/settings/models/settings.interfaces';

/**
 * Puntos de emisión del usuario actual.
 *
 * Cada usuario de empresa puede tener asignados puntos de emisión
 * (`company-users/{uid}.emissionPoints`, como «001-002»: establecimiento-punto)
 * y uno por defecto (`defaultEmissionPoint`). Vacío = todos; el admin, todos.
 * Las reglas de Firestore lo exigen al guardar facturas, retenciones y notas de
 * débito; aquí solo se filtran las series para no ofrecer las que no puede usar.
 */
export interface EmissionPointAccess {
  /** Puntos asignados. Vacío con `unrestricted` = todos. */
  allowed: string[];
  defaultPoint: string | null;
  unrestricted: boolean;
}

const pad3 = (v: unknown) => String(v ?? '').trim().padStart(3, '0');

/** «001-002» de una serie. */
export function seriesPointKey(s: Pick<DocumentSeries, 'establishment' | 'emissionPoint'>): string {
  return `${pad3(s.establishment)}-${pad3(s.emissionPoint)}`;
}

/** Texto para el selector: «001-002 · Serie A — Caja 2». */
export function seriesLabel(s: DocumentSeries): string {
  return `${seriesPointKey(s)} · Serie ${s.code}${s.name ? ' — ' + s.name : ''}`;
}

/** Las series que el usuario puede usar. */
export function filterSeriesByAccess(series: DocumentSeries[], access: EmissionPointAccess): DocumentSeries[] {
  if (access.unrestricted) return series;
  return series.filter(s => access.allowed.includes(seriesPointKey(s)));
}

/**
 * Series activas de un tipo de comprobante que el usuario puede usar. Con
 * `fallbackToAny`, si no hay series de ese tipo, las activas de cualquier tipo
 * (lo que ya hacían retenciones y notas de débito), también filtradas.
 */
export function seriesForDocument(
  list: DocumentSeries[],
  documentType: DocumentSeries['documentType'],
  access: EmissionPointAccess,
  fallbackToAny = false,
): DocumentSeries[] {
  const active = list.filter(s => s.isActive);
  const ofType = filterSeriesByAccess(active.filter(s => s.documentType === documentType), access);
  if (ofType.length || !fallbackToAny) return ofType;
  return filterSeriesByAccess(active, access).slice(0, 1);
}

/** La serie con la que abre un comprobante nuevo: la del punto por defecto, si no la primera. */
export function pickDefaultSeries(series: DocumentSeries[], access: EmissionPointAccess): DocumentSeries | undefined {
  return (access.defaultPoint && series.find(s => seriesPointKey(s) === access.defaultPoint)) || series[0];
}

@Injectable({ providedIn: 'root' })
export class EmissionPointAccessService {
  private auth = inject(AuthService);
  private companyUsers = inject(CompanyUsersService);

  /** Lee el perfil del usuario actual. Si no se puede leer, no restringe: las reglas deciden al guardar. */
  async load(): Promise<EmissionPointAccess> {
    const user = this.auth.user();
    const all: EmissionPointAccess = { allowed: [], defaultPoint: null, unrestricted: true };
    if (!user || user.role === 'admin' || user.role === 'super_admin') return all;
    try {
      const profile = await firstValueFrom(this.companyUsers.getCompanyUser(user.uid));
      const allowed = profile?.emissionPoints ?? [];
      return {
        allowed,
        defaultPoint: profile?.defaultEmissionPoint ?? null,
        unrestricted: allowed.length === 0,
      };
    } catch (err) {
      console.warn('[EmissionPointAccess] No se pudo leer el perfil del usuario', err);
      return all;
    }
  }
}

/**
 * Por qué no se puede guardar con esa serie, o null si se puede. En edición la
 * serie del comprobante se respeta aunque ya no esté en la lista.
 */
export function seriesGuardMessage(
  series: DocumentSeries[],
  seriesCode: string | null | undefined,
  access: EmissionPointAccess,
  isNew: boolean,
): string | null {
  if (!isNew) return null;
  if (series.length === 0) {
    return access.unrestricted
      ? null
      : 'No hay series para tus puntos de emisión. Pide al administrador que te asigne un punto con serie.';
  }
  return series.some(s => s.code === seriesCode) ? null : 'Elige el punto de emisión del comprobante.';
}
