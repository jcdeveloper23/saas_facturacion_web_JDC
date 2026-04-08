# Aprendizajes — Angular + CoreUI

## Nav Items en CoreUI Sidebar

**Patrón correcto (angular_agent.md):**
```typescript
// _nav.ts — estructura FLAT con title:true para separadores
export const navItems: INavData[] = [
  { title: true, name: 'Sección' },
  { name: 'Ítem', url: '/ruta', iconComponent: { name: 'cil-icono' } },
];

// En el layout: SIEMPRE signal()
readonly navItems = signal(navItems);
// En HTML: [navItems]="navItems()"
```

**NO usar `children` en nav items** — El sidebar de CoreUI 5.x sí soporta children pero los íconos deben ser `icon: 'nav-icon-bullet'` (string), NO `iconComponent`. Usar estructura flat con `title:true` es más limpio y compatible.

## Rutas de Importación por Profundidad de Carpeta

Los componentes en `super-admin/pages/defaults/currencies/` están **4 niveles** dentro de `features/`:
```
features/super-admin/pages/defaults/currencies/component.ts
```
- `../` → defaults/
- `../../` → pages/  
- `../../../` → super-admin/
- `../../../services/` → super-admin/services/ ✅
- `../../../models/` → super-admin/models/ ✅
- `../../../../` → features/
- `../../../../../` → app/
- `../../../../../core/services/` → app/core/services/ ✅

**Error común:** usar `../../services/` (falta un nivel) → "Cannot resolve module"

## onSnapshot sin collectionData

Patrón correcto siempre:
```typescript
getItems(): Observable<Item[]> {
  return new Observable(observer => {
    const ref = collection(this.fs, 'path');
    const unsub = onSnapshot(ref,
      snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() } as Item))),
      err => { console.error('Error:', err); observer.error(err); }
    );
    return () => unsub();
  });
}
```

## WriteBatch — Límite 500 ops

Para seeds grandes (ej: 240 países + 12 divisas + otros ≈ 270 ops), siempre verificar que el total no supere 500:
- Si supera, dividir en chunks de 400 ops (ver firebase_agent.md)

## FormBuilder getRawValue() y TypeScript strict

`form.getRawValue()` retorna tipo relajado. Para evitar TS2571 y TS7006:
```typescript
// Tipar explícitamente los callbacks
this.svc.getItems().subscribe({
  next: (list: Item[]) => { ... },
  error: (err: any) => { ... }
});
```
