# Firebase Pagination & Read Optimization Guidelines

> **Estado:** Vigente desde 2026-08-24  
> **Aplica a:** Todos los módulos Angular + Firebase del proyecto  
> **Contexto:** Auditoría realizada sobre `accounting/journal-entries`. Patrón extendido a todos los módulos con colecciones de crecimiento ilimitado.

---

## Principio fundamental

> **Nunca cargar una colección completa sin `limit()`.** Toda consulta a una colección que puede crecer con el tiempo debe tener un límite explícito o paginación.

---

## Cuándo usar cada patrón

| Caso de uso | Patrón | Motivo |
|---|---|---|
| Lista con >50 docs potenciales | `getDocs` + cursor pagination | Evita leer N docs en cada update |
| Vista de detalle de 1 documento | `onSnapshot` | Sí necesita tiempo real |
| Colección append-only de auditoría | `onSnapshot` + `limit(200)` | Acotado y aceptable |
| Colección pequeña (<30 docs fijos) | `onSnapshot` sin limit | Bajo riesgo, real-time útil |
| Check de existencia | `getDocs` + `limit(1)` | Solo 1 lectura |
| Reportes contables (Libro Mayor, etc.) | `getDocs` acotado por período | One-shot, sin stream |

---

## Niveles de riesgo por colección (auditoría 2026-08-24)

| Colección | Riesgo | Estado actual | Acción requerida |
|---|---|---|---|
| `journal_entries` — lista | **ALTO** | Sin limit, onSnapshot | Paginar con getDocs, pageSize=50 |
| `journal_entries` — hasMovements | **CRÍTICO** | getDocs sin limit | `limit(1)` + campo `accountCodes[]` |
| `journal_entries` — getLibroMayor | **ALTO** | getDocs sin limit | periodId obligatorio + limit(500) |
| `petty_cash_movements` | Medio | onSnapshot sin limit | limit(200) |
| `advances` | Medio | onSnapshot sin limit | filtro por año + limit(200) |
| `bank_statements` | Medio | onSnapshot sin limit | limit(50) |
| `bank_transactions` | Medio | onSnapshot sin limit | limit(1000) |
| `audit_log` | Bajo ✅ | onSnapshot + limit(200) | — |
| `budgets` | Bajo ✅ | doc lookup | — |
| `petty_cash_funds` | Bajo ✅ | onSnapshot (colección pequeña) | — |

---

## Patrón estándar: paginación cursor-based

### Tipos compartidos (agregar en el modelo o en un archivo `pagination.types.ts`)

```typescript
import { QueryDocumentSnapshot } from '@angular/fire/firestore';

export interface PageResult<T> {
  items: T[];
  nextCursor: QueryDocumentSnapshot | null;
  hasMore: boolean;
}

export interface PageRequest {
  pageSize?: number;           // default: 50
  cursor?: QueryDocumentSnapshot; // undefined = primera página
}
```

### Servicio — método paginado

```typescript
import { getDocs, query, orderBy, where, limit, startAfter, getCountFromServer } from '@angular/fire/firestore';

async getEntriesPage(
  filters: JournalEntryFilters,
  pageSize = 50,
  cursor?: QueryDocumentSnapshot
): Promise<PageResult<JournalEntry>> {

  const ref = collection(this.firestore, this.colPath);
  const constraints: QueryConstraint[] = [
    where('periodYear', '==', filters.year),
    orderBy('date', 'desc'),
    orderBy('number', 'desc'),
    limit(pageSize + 1)          // +1 para detectar si hay más
  ];

  if (cursor) constraints.push(startAfter(cursor));

  const snap = await getDocs(query(ref, ...constraints));
  const hasMore = snap.docs.length > pageSize;
  const items = snap.docs
    .slice(0, pageSize)
    .map(d => ({ id: d.id, ...d.data() } as JournalEntry));

  return {
    items,
    hasMore,
    nextCursor: hasMore ? snap.docs[pageSize - 1] : null
  };
}
```

### Componente — señales de paginación

```typescript
// ── Paginación ────────────────────────────────────────────────────────────
readonly PAGE_SIZE = 50;
currentPage   = signal(1);
hasMore       = signal(false);
loadingPage   = signal(false);
// Historial de cursors para poder retroceder: index 0 = página 1, etc.
private cursorHistory = signal<(QueryDocumentSnapshot | null)[]>([null]);

// Al cambiar filtros, siempre reset
private resetPagination(): void {
  this.currentPage.set(1);
  this.cursorHistory.set([null]);
  this.hasMore.set(false);
}

async loadPage(direction: 'next' | 'prev' | 'reset' = 'reset'): Promise<void> {
  if (this.loadingPage()) return;
  this.loadingPage.set(true);

  let page = this.currentPage();
  let cursor: QueryDocumentSnapshot | null;

  if (direction === 'next') {
    page++;
    cursor = this.cursorHistory()[page - 1] ?? null;
  } else if (direction === 'prev') {
    page--;
    cursor = this.cursorHistory()[page - 1] ?? null;
  } else {
    page = 1;
    cursor = null;
  }

  try {
    const result = await this.svc.getEntriesPage(this.buildFilters(), this.PAGE_SIZE, cursor ?? undefined);
    this.entries.set(result.items);
    this.hasMore.set(result.hasMore);
    this.currentPage.set(page);

    // Guardar el cursor de la página siguiente en el historial
    if (result.nextCursor) {
      const history = [...this.cursorHistory()];
      history[page] = result.nextCursor;
      this.cursorHistory.set(history);
    }
  } finally {
    this.loadingPage.set(false);
  }
}
```

### Template — controles de paginación

```html
<!-- Footer de paginación -->
<div class="pagination-bar">
  <button cButton color="secondary" variant="outline" size="sm"
          [disabled]="currentPage() === 1 || loadingPage()"
          (click)="loadPage('prev')">
    <svg cIcon name="cilArrowLeft" size="sm"></svg> Anterior
  </button>
  <span class="page-info text-secondary">Página {{ currentPage() }}</span>
  <button cButton color="secondary" variant="outline" size="sm"
          [disabled]="!hasMore() || loadingPage()"
          (click)="loadPage('next')">
    Siguiente <svg cIcon name="cilArrowRight" size="sm"></svg>
  </button>
</div>
```

---

## Patrón: check de existencia eficiente

### MALO — carga todos los docs para verificar uno
```typescript
// ❌ NUNCA hacer esto
const snap = await getDocs(query(ref, where('status', '==', 'posted')));
for (const d of snap.docs) {
  if (d.data().lines.some(l => l.accountCode === code)) return true;
}
```

### BUENO — campo denormalizado + limit(1)
```typescript
// ✅ Agregar campo accountCodes: string[] en el modelo JournalEntry
// Poblarlo al crear/publicar el asiento:
//   entry.accountCodes = entry.lines.map(l => l.accountCode)

async hasMovementsForAccount(accountCode: string): Promise<boolean> {
  const snap = await getDocs(
    query(
      collection(this.firestore, this.colPath),
      where('status', '==', 'posted'),
      where('accountCodes', 'array-contains', accountCode),
      limit(1)
    )
  );
  return !snap.empty;
}
```

---

## Patrón: reportes acotados por período

```typescript
// ✅ periodId SIEMPRE requerido para consultas históricas
async getLibroMayor(
  accountCode: string,
  periodId: string,          // obligatorio
  costCenterId?: string
): Promise<LibroMayorLine[]> {
  const snap = await getDocs(
    query(
      collection(this.firestore, this.colPath),
      where('status', '==', 'posted'),
      where('periodId', '==', periodId),  // partición obligatoria
      orderBy('date', 'asc'),
      orderBy('number', 'asc'),
      limit(500)                           // seguridad: ningún período debería tener >500 asientos
    )
  );
  // filtro en memoria por accountCode y costCenterId (sobre resultado ya acotado)
}
```

---

## Reglas que todo agente debe seguir antes de implementar

### ❌ Prohibido
1. `onSnapshot` sin `limit()` en colecciones que crecen con el tiempo (journal_entries, advances, petty_cash_movements, bank_statements)
2. `getDocs` sin `limit()` para checks de existencia
3. Cargar toda una colección y filtrar en memoria cuando el filtro se puede expresar en Firestore
4. `onSnapshot` para vistas de lista paginadas (usa `getDocs` — real-time es overkill y cobra por re-fire)

### ✅ Obligatorio al crear nuevos métodos de lista
1. Todo método que devuelva una lista de documentos debe recibir `pageSize` y `cursor` opcional
2. Si la colección puede exceder 100 docs por empresa, usar `getDocs` + cursor pagination
3. Si es un check de existencia, usar `limit(1)`
4. Si es un reporte histórico, exigir una partición (año, período, entidad) como filtro obligatorio

### ✅ Obligatorio al crear nuevos modelos con líneas embebidas
Si el documento contiene un array de sub-items que luego se necesitará buscar (ej. `lines[].accountCode`):
- Añadir un campo denormalizado de los IDs/códigos a nivel raíz del documento
- Ejemplo: `accountCodes: string[]` en JournalEntry para poder usar `array-contains`

---

## Colecciones nuevas — checklist antes de implementar

Al crear una nueva colección en Firestore para cualquier módulo:

- [ ] ¿Puede tener >100 documentos por empresa? → Implementar paginación desde el inicio
- [ ] ¿Necesita búsqueda por campo de sub-array? → Campo denormalizado en el root
- [ ] ¿Es append-only (logs, movimientos)? → `limit(N)` mínimo en todas las queries de lista
- [ ] ¿Es una vista de reporte? → `getDocs` acotado, nunca `onSnapshot`
- [ ] ¿Es check de existencia? → `limit(1)` siempre
- [ ] ¿Muestra datos en tiempo real crítico? → Solo entonces usar `onSnapshot` (ej. estado de un proceso en curso)

---

## Referencia de implementación

- **Primer módulo implementado con este patrón:** `accounting/journal-entries` (pendiente implementación, plan aprobado 2026-08-24)
- **Audit log** ya implementado con `limit(200)` — ver `audit-log.service.ts` como referencia mínima
- **PageResult / PageRequest types:** pendiente extraer a `src/app/core/types/pagination.types.ts`
